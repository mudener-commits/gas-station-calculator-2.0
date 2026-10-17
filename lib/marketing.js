const operating = require('./operating');

const DEFINITIONS = [
  { key: '92', name: '92 号汽油', unit: '升', density: 0.73, vat: 0.13, volumeKey: 'vol92', purchaseKey: 'purchase92', saleKey: 'sale92', referencePurchase: 7500, defaultMargin: 1 },
  { key: '95', name: '95 号汽油', unit: '升', density: 0.73, vat: 0.13, volumeKey: 'vol95', purchaseKey: 'purchase95', saleKey: 'sale95', referencePurchase: 8000, defaultMargin: 1.3 },
  { key: 'diesel', name: '柴油', unit: '升', density: 0.84, vat: 0.13, volumeKey: 'volDiesel', purchaseKey: 'purchaseDiesel', saleKey: 'saleDiesel', referencePurchase: 6500, defaultMargin: 0.3 },
  { key: 'lng', name: 'LNG', unit: '公斤', density: 1, vat: 0.09, volumeKey: 'volLng', purchaseKey: 'purchaseLng', saleKey: 'saleLng', referencePurchase: 4000, defaultMargin: 0.5 }
];

const copy = value => JSON.parse(JSON.stringify(value));
function initialForm() {
  return {
    name: '', mode: 'discount', days: 7, activityCost: 0, hasLng: false,
    operatingBase: operating.initialForm(), wageMode: 'people',
    products: DEFINITIONS.map(p => ({ key: p.key, name: p.name, unit: p.unit, vat: p.vat,
      volume: 0, margin: p.defaultMargin, change: 0, participation: 100,
      incrementalCost: 0, promotionCost: 0 }))
  };
}
function fromOperatingRecord(record) {
  if (!record || !record.form) throw new Error('找不到可带入的经营数据');
  const source = operating.grossForm(record.form);
  const result = operating.calculate(source, record.wageMode || 'people');
  const form = initialForm();
  form.name = record.stationName || '';
  form.operatingBase = source;
  form.wageMode = record.wageMode || 'people';
  form.hasLng = !!source.hasLng;
  form.products = form.products.map((p, i) => {
    const row = result.rows[i];
    if (!row) return p;
    return { ...p, volume: row.daily,
      margin: row.daily ? (row.grossSales - row.grossPurchase) / (row.daily * 365) : p.margin };
  });
  return form;
}
function number(value, label, max = 1e9) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < 0 || n > max) throw new Error(label + '请填写有效的非负数字');
  return n;
}
function prepare(input) {
  if (!input || !Array.isArray(input.products) || input.products.length !== 4) throw new Error('油气品种数据不完整');
  const mode = input.mode === 'raise' ? 'raise' : 'discount';
  const days = number(input.days, '活动天数', 3650);
  if (!Number.isInteger(days) || days < 1) throw new Error('活动天数请填写 1–3650 的整数');
  const activityCost = number(input.activityCost, '一次性活动费 / 物料费');
  const hasLng = !!input.hasLng;
  const products = DEFINITIONS.map((def, i) => {
    const p = input.products[i];
    if (!p || p.key !== def.key) throw new Error('油气品种顺序不正确');
    const volume = number(p.volume, def.name + '日均销量', 1e7);
    const margin = number(p.margin, def.name + '每单位毛利', 1e5);
    const change = number(p.change, def.name + '调整幅度', 1e5);
    const participation = number(p.participation, def.name + '参与比例', 100);
    const incrementalCost = number(p.incrementalCost, def.name + '新增变动费用', 1e5);
    const promotionCost = number(p.promotionCost, def.name + '活动增量费用', 1e5);
    return { ...def, volume: def.key === 'lng' && !hasLng ? 0 : volume, margin, change,
      participation: participation / 100, incrementalCost, promotionCost };
  });
  const oilBase = products.slice(0, 3).reduce((s, p) => s + p.volume, 0);
  const lngBase = products[3].volume;
  if (oilBase + lngBase <= 0) throw new Error('请至少填写一个油气品种的原日均销量');
  const base = operating.grossForm(input.operatingBase || operating.initialForm());
  return { name: String(input.name || '').trim(), mode, days, activityCost, hasLng,
    products, oilBase, lngBase, base, wageMode: input.wageMode || 'people' };
}
function operatingForm(context, factor, changed) {
  const form = { ...context.base, customPrice: true, taxMode: 'gross' };
  context.products.forEach(p => {
    const volume = p.volume * factor;
    form[p.volumeKey] = volume;
    const purchase = context.base.customPrice ? Number(context.base[p.purchaseKey]) : p.referencePurchase;
    form[p.purchaseKey] = purchase;
    const eligible = changed && p.change > 0 && volume > 0
      ? factor <= 1 ? p.participation : (p.participation + factor - 1) / factor : 0;
    const adjustedMargin = p.margin + (context.mode === 'discount' ? -1 : 1) * p.change * eligible;
    form[p.saleKey] = purchase + adjustedMargin * 1000 / p.density;
    if (form[p.saleKey] < 0) throw new Error(p.name + '活动后售价不能为负，请检查调整幅度');
  });
  form.hasLng = context.lngBase > 0 && factor > 0;
  return form;
}
function createEvaluator(input) {
  const context = prepare(input);
  const baseline = operating.calculate(operatingForm(context, 1, false), context.wageMode);
  const cache = new Map();
  const evaluate = rawFactor => {
    const factor = number(rawFactor, '销量倍数', 1e4);
    if (cache.has(factor)) return cache.get(factor);
    // The operating engine requires a positive volume. Use a negligible volume
    // at zero so its fixed-cost, VAT and fee rules remain the same.
    const candidate = operating.calculate(operatingForm(context, factor || 1e-12, true), context.wageMode);
    const baselineVariable = context.products.reduce((s, p) => s + p.volume * p.incrementalCost, 0);
    const candidateVariable = factor * baselineVariable;
    const promotionCost = context.products.reduce((s, p) => {
      const eligibleVolume = p.volume * (factor <= 1 ? factor * p.participation : p.participation + factor - 1);
      return s + eligibleVolume * p.promotionCost;
    }, 0);
    const operatingDelta = (candidate.annualEbitda - baseline.annualEbitda) / 365;
    const value = operatingDelta - (candidateVariable - baselineVariable)
      - promotionCost - context.activityCost / context.days;
    cache.set(factor, value);
    return value;
  };
  return { context, baseline, evaluate };
}
function calculate(input) {
  const { context, baseline, evaluate } = createEvaluator(input);
  const atBase = evaluate(1);
  let factor = null, status = 'solved';
  if (atBase >= 0) {
    if (evaluate(0) >= 0) factor = 0;
    else {
      let low = 0, high = 1;
      for (let i = 0; i < 64; i++) { const mid = (low + high) / 2; if (evaluate(mid) >= 0) high = mid; else low = mid; }
      factor = high;
    }
  } else {
    let low = 1, high = 2;
    while (high < 8192 && evaluate(high) < 0) { low = high; high = Math.min(high * 2, 8192); }
    if (evaluate(high) < 0) status = 'unreachable';
    else {
      for (let i = 0; i < 64; i++) { const mid = (low + high) / 2; if (evaluate(mid) >= 0) high = mid; else low = mid; }
      factor = high;
    }
  }
  return { status, factor, atBase, baselineAnnualEbitda: baseline.annualEbitda,
    oilBase: context.oilBase, lngBase: context.lngBase, days: context.days,
    requiredOil: factor === null ? null : Math.ceil(context.oilBase * factor - 1e-9),
    requiredLng: factor === null ? null : Math.ceil(context.lngBase * factor - 1e-9),
    evaluate, context, time: new Date().toISOString() };
}
module.exports = { DEFINITIONS, initialForm, fromOperatingRecord, prepare, createEvaluator, calculate };
