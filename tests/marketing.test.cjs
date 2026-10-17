const test = require('node:test');
const assert = require('node:assert/strict');
const marketing = require('../lib/marketing');
const operating = require('../lib/operating');

function example() {
  const form = marketing.initialForm();
  form.products[0].volume = 5000;
  form.products[0].change = 0.1;
  form.products[1].volume = 2000;
  form.products[1].change = 0.1;
  form.products[2].volume = 3000;
  return form;
}

test('full discount requires more daily volume and exactly preserves operating profit at the crossing', () => {
  const result = marketing.calculate(example());
  assert.equal(result.status, 'solved');
  assert.ok(result.factor > 1);
  assert.ok(result.requiredOil > result.oilBase);
  assert.ok(Math.abs(result.evaluate(result.factor)) < 1e-7);
  assert.ok(result.evaluate(1) < 0);
});

test('partial participation and shorter campaign costs change the required lift in the expected direction', () => {
  const full = example();
  const fullFactor = marketing.calculate(full).factor;
  full.products[0].participation = 60;
  full.products[1].participation = 60;
  const partialFactor = marketing.calculate(full).factor;
  assert.ok(partialFactor < fullFactor);
  full.activityCost = 7000;
  const costlyFactor = marketing.calculate(full).factor;
  assert.ok(costlyFactor > partialFactor);
  full.days = 14;
  assert.ok(marketing.calculate(full).factor < costlyFactor);
});

test('price increase permits a decline; oil and LNG keep their own units', () => {
  const form = example();
  form.mode = 'raise';
  form.hasLng = true;
  form.products[3].volume = 1000;
  form.products[3].change = 0.05;
  const result = marketing.calculate(form);
  assert.ok(result.factor < 1);
  assert.equal(result.oilBase, 10000);
  assert.equal(result.lngBase, 1000);
  assert.equal(result.requiredOil, Math.ceil(10000 * result.factor - 1e-9));
  assert.equal(result.requiredLng, Math.ceil(1000 * result.factor - 1e-9));
  assert.ok(Math.abs(result.evaluate(result.factor)) < 1e-7);
});

test('LNG-only calculation works and 9% VAT remains separate from oil', () => {
  const form = marketing.initialForm();
  form.hasLng = true;
  form.products[3].volume = 2000;
  form.products[3].margin = 0.5;
  form.products[3].change = 0.1;
  const result = marketing.calculate(form);
  assert.equal(result.oilBase, 0);
  assert.equal(result.lngBase, 2000);
  assert.ok(result.requiredLng > 2000);
  assert.ok(Math.abs(result.evaluate(result.factor)) < 1e-7);
});

test('latest profit calculation imports daily volumes and gross per-unit margins', () => {
  const source = operating.sample(true);
  const imported = marketing.fromOperatingRecord({ form: source, wageMode: 'people', stationName: '测试站' });
  const result = operating.calculate(source);
  assert.equal(imported.name, '测试站');
  assert.equal(imported.hasLng, true);
  assert.equal(imported.products[3].volume, source.volLng);
  result.rows.forEach((row, i) => {
    assert.ok(Math.abs(imported.products[i].margin - (row.grossSales - row.grossPurchase) / (row.daily * 365)) < 1e-9);
  });
});

test('a deep discount that destroys incremental contribution is reported unreachable', () => {
  const form = marketing.initialForm();
  form.products[0].volume = 5000;
  form.products[0].change = 5;
  const result = marketing.calculate(form);
  assert.equal(result.status, 'unreachable');
  assert.equal(result.factor, null);
});

test('promotion cost applies without a price change', () => {
  const form = marketing.initialForm();
  form.products[0].volume = 5000;
  form.products[0].promotionCost = 0.2;
  const result = marketing.calculate(form);
  assert.ok(result.factor > 1);
  assert.ok(result.evaluate(1) < 0);
  assert.ok(Math.abs(result.evaluate(result.factor)) < 1e-7);
});
