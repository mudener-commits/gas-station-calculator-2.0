const { test } = require('node:test');
const assert = require('node:assert/strict');
const inv = require('../lib/investment'), be = require('../lib/break-even'), reports = require('../lib/report');
function ownForm() {
  const f = inv.initialForm(); Object.assign(f, { selfOwned: true, annualEbitda: 1500000 });
  f.assets[0].amount = 5000000; return f;
}
test('自有站独立算例：500万资产十年折旧，零租金，流动资金全额回收', () => {
  const f = ownForm(), r = inv.calculate(f);
  assert.equal(r.initial, 5500000); assert.equal(r.initialRent, 0); assert.equal(r.modeName, '自有站经营');
  for (const y of r.rows) {
    assert.equal(y.rentExpense, 0); assert.equal(y.depreciation, 500000);
    assert.equal(y.netProfit, 750000); assert.equal(y.shareholderAnnualCash, 1250000);
  }
  assert.equal(r.workingCapitalRecovery, 500000);
  assert.ok(Math.abs(r.shareholderFlows.at(-1) - (1250000 / 12 + 500000)) < 1e-7);
});
test('自有站覆盖所有隐藏合同及旧合作条款，原表单不被改写', () => {
  const baseline = inv.calculate(ownForm());
  for (const mode of [0,1,2,3,4]) {
    const f = ownForm(); Object.assign(f, { mode, cooperation: 0, rent: 'bad', rentGrowth: 999, paymentYears: 0, frequency: 0, prepaidPeriods: 0, shareRate: 1000, managementFee: 888888 });
    const before = structuredClone(f), r = inv.calculate(f);
    assert.deepEqual(f, before); assert.deepEqual(r.shareholderFlows, baseline.shareholderFlows);
    assert.ok(inv.rentPlan(f).paid.every(v => v === 0));
    assert.ok(r.rows.every(y => y.ownerRent === 0 && y.management === 0));
  }
  const old = ownForm(); delete old.selfOwned; old.rent = 100000;
  assert.ok(inv.calculate(old).rows[0].rentExpense > 99999);
});
test('自有站贷款和两种倒推保留，报告两版均标明经营方式', () => {
  const f = ownForm(); Object.assign(f, { mode: 4, rent: 900000, loanAmount: 1000000, loanYears: 15 });
  const r = inv.calculate(f); assert.ok(r.terminalDebt > 0); assert.equal(r.ownInitial, 4500000);
  const inputs = be.initialInputs(), result = be.calculate(f, inputs);
  const zeroRental = { ...f, selfOwned: false, mode: 0, rent: 0 };
  const expected = be.calculate(zeroRental, inputs);
  assert.deepEqual(result.accounting, expected.accounting); assert.deepEqual(result.investment, expected.investment);
  for (const full of [reports.investment(r), reports.breakEven(result)]) for (const report of [full, reports.brief(full)]) {
    const text = JSON.stringify(report);
    assert.match(text, /自有站经营/); assert.match(text, /年度租金/); assert.match(text, /资产金额仍按期初投入/);
    assert.ok(!text.includes('租金支付安排')); assert.ok(!text.includes('租金年递增'));
  }
  f.loanAmount = 5600000; assert.throws(() => inv.calculate(f), /贷款金额不得超过/);
});
