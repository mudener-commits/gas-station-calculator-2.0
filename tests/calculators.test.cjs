const { test } = require('node:test');
const assert = require('node:assert/strict');
const operating = require('../lib/operating');
const investment = require('../lib/investment');
const finance = require('../lib/finance');
const reports = require('../lib/report');
const { layout } = require('../lib/report-layout');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function form() { const f = investment.initialForm(); f.workingCapital = 0; f.annualEbitda = 100000; f.assets[1].amount = 200000; return f; }

test('含税收支扣增值税与净额核算等效，113 万示例仅扣一次税', () => {
  const f = { ...operating.initialForm(), vol92: 100 * 1000 / (365 * .73), customPrice: true, sale92: 11300, purchase92: 9040,
    hasLicense: false, cardRate: 0, insuranceCost: 0, landUseTax: 0 };
  const r = operating.calculate(f);
  near(r.grossSales, 1130000); near(r.grossPurchase, 904000);
  near(r.outputVat, 130000); near(r.inputVat, 104000); near(r.vat, 26000);
  near(r.annualEbitda, 200000 - r.surtax - r.stamp);
  near(r.annualEbitda, r.grossSales - r.grossPurchase - r.vat - r.operatingCost - r.surtax - r.stamp);
});
test('历史不含税报价转成含税输入，油品与 LNG 结果不变且不会二次转换', () => {
  const old = { ...operating.sample(true), customPrice: true, taxMode: 'net' };
  const snapshot = structuredClone(old), converted = operating.grossForm(old);
  assert.equal(converted.taxMode, 'gross'); near(converted.purchase92, old.purchase92 * 1.13);
  near(converted.purchaseLng, old.purchaseLng * 1.09);
  assert.deepEqual(old, snapshot); assert.deepEqual(operating.grossForm(converted), converted);
  const a = operating.calculate(old), b = operating.calculate(converted);
  for (const key of ['annualEbitda', 'vat', 'grossSales', 'grossPurchase', 'inputVat', 'outputVat']) near(a[key], b[key]);
});
test('含税报告按月年同比缩放，页面与图片含相同税额和中文说明', () => {
  for (const period of ['year', 'month']) {
    const r = operating.calculate(operating.sample(true), 'people', period), report = reports.operating(r);
    const money = require('../lib/ui').money;
    const rows = report.sections[0].rows;
    assert.equal(rows.find(x=>x.label==='采购成本（含税）').value, money(r.grossPurchase * r.scale));
    assert.equal(report.sections.flatMap(s=>s.rows).find(x=>x.label==='应交增值税额').value, money(r.vat * r.scale));
    const plain = JSON.stringify(report);
    for(const hidden of ['销项税额','可抵扣进项税额','销售净收入','采购净成本','价税分开']) assert.ok(!plain.includes(hidden), hidden);
    assert.ok(report.terms.some(t=>t.id==='ebitda'));
    const plan = layout(report, (t, size) => t.length * size);
    const text = plan.items.filter(i=>i.kind==='text').map(i=>i.text).join('');
    assert.ok(text.includes('销售额（含税）')); assert.ok(text.includes('应交增值税额'));
    assert.ok(text.includes('不等同于实际现金净流入')); assert.ok(!text.includes('销项税额'));
    assert.ok(!/卖油|购油|到手现金/.test(text));
  }
});
test('采购进项超过销项时不把余额视为现金退税，不改变净额利润', () => {
  const f = { ...operating.sample(false), customPrice: true, purchase92: 20000, sale92: 1000 };
  const r = operating.calculate(f); assert.equal(r.vat, 0); assert.ok(r.vatCredit > 0);
  near(r.vatCredit, r.inputVat-r.outputVat);
  near(r.annualEbitda, r.revenue-r.purchase-r.operatingCost-r.surtax-r.stamp);
  assert.ok(reports.operating(r).notes.some(x=>x.includes('不代表已收到退税')));
});

test('简明经营报告的税费和日常费用不重复统计，正常场景含税收支与结果勾稽', () => {
  for (const lng of [false, true]) for (const period of ['year','month']) {
    const f = operating.sample(lng); f.propertyTax = 5000;
    const r = operating.calculate(f,'people',period), report = reports.operating(r), money = require('../lib/ui').money;
    const holding = Number(f.propertyTax) + Number(f.landUseTax);
    const daily = r.operatingCost-holding, taxes=r.vat+r.surtax+r.stamp+holding;
    const summary=report.sections[0].rows;
    assert.equal(summary[2].value,money(daily*r.scale)); assert.equal(summary[3].value,money(taxes*r.scale));
    assert.equal(summary[4].value,money(r.annualEbitda*r.scale)); assert.ok(summary[4].highlight);
    near(r.grossSales-r.grossPurchase-daily-taxes,r.annualEbitda);
    assert.ok(report.sections[1].rows.every(x=>!['房产税','土地使用税'].includes(x.label)));
    assert.ok(report.sections[2].rows.some(x=>x.label==='房产税'));
    assert.equal(report.metrics[0].label,(period==='month'?'月均':'年度')+'租金前经营收益');
  }
});

test('简要版复用完整结果且不修改完整报告，双品牌与指标中文解释保留', () => {
  for(const full of [reports.operating(operating.calculate(operating.sample(true))),reports.investment(investment.calculate(form()))]) {
    const snapshot=structuredClone(full), summary=reports.brief(full);
    assert.deepEqual(full,snapshot);assert.deepEqual(summary.metrics,full.metrics);
    assert.deepEqual(full.notes,summary.notes);assert.deepEqual(full.terms,summary.terms);
    assert.deepEqual(reports.conciseExplanations(full),full);
    assert.ok(!full.notes.some(n=>n.includes('请查看完整版报告')));
    assert.equal(summary.annualTable,undefined);assert.match(summary.title,/摘要$/);
    assert.ok(!summary.sections.some(s=>s.title==='日常经营费用明细'));
    if(full.type==='investment')assert.deepEqual(summary.terms.map(t=>t.id),['irr','npv']);
    const measure=(t,s)=>t.length*s, shortPlan=layout(summary,measure), fullPlan=layout(full,measure);
    assert.ok(shortPlan.height<fullPlan.height); assert.equal(shortPlan.items.filter(i=>i.kind==='image').length,2);
    assert.ok(shortPlan.items.some(i=>i.kind==='text'&&i.text.includes('在这里，读懂中国加油站。')));
  }
});
test('不含税价格和含税价格等效，支付手续费用含税收款', () => {
  const gross = operating.sample(true); gross.customPrice = true;
  const net = { ...gross, taxMode: 'net' };
  ['purchase92', 'sale92', 'purchase95', 'sale95', 'purchaseDiesel', 'saleDiesel'].forEach(k => { net[k] /= 1.13; });
  ['purchaseLng', 'saleLng'].forEach(k => { net[k] /= 1.09; });
  near(operating.calculate(gross).annualEbitda, operating.calculate(net).annualEbitda);
  near(operating.calculate(gross).costs[5].value, operating.calculate(net).costs[5].value);
});
test('不含税利润不能重复扣增值税', () => {
  const f = operating.initialForm(); Object.assign(f, { vol92: 1000, customPrice: true, taxMode: 'net', purchase92: 1000, sale92: 2000, hasLicense: false, cardRate: 0, insuranceCost: 0, landUseTax: 0 });
  const r = operating.calculate(f), tons = 1000 * 365 * .73 / 1000;
  const margin = tons * 1000, vat = margin * .13;
  near(r.annualEbitda, margin - vat * .12 - tons * 2000 * .0003);
});
test('利润页完全忽略租金、折旧、贷款、所得税及合作数据', () => {
  const f = operating.sample(false), before = operating.calculate(f);
  Object.assign(f, { landRent: 999999, depreciation: 55555, loanAmount: 999999, interestRate: 15, totalInvestment: 500000, managementFee: 33333, incomeTaxMode: 'small' });
  near(operating.calculate(f).annualEbitda, before.annualEbitda);
  assert.equal('landRent' in operating.cleanForm(f), false);
  assert.equal('netProfit' in before, false);
});
test('月均 × 12 等于年度，费用分摊加总相符', () => {
  const f = operating.sample(true), year = operating.calculate(f), month = operating.calculate(f, 'people', 'month');
  near(month.annualEbitda * month.scale * 12, year.annualEbitda);
  near(year.rows.reduce((s, r) => s + r.allocatedCost, 0), year.operatingCost + year.surtax + year.stamp);
});
test('普通员工、站长、社保与持有税费均进入经营成本', () => {
  const f = operating.sample(false), before = operating.calculate(f); f.hasSocial = true;
  near(before.annualEbitda - operating.calculate(f).annualEbitda, (5 * 4000 + 8000) * 12 * .32);
  f.propertyTax += 5000; f.landUseTax += 2000; f.insuranceCost += 1000;
  near(before.annualEbitda - operating.calculate(f).annualEbitda, (5 * 4000 + 8000) * 12 * .32 + 8000);
});
test('无销量、负费用、非数值和支付占比超限被拒绝', () => {
  assert.throws(() => operating.calculate(operating.initialForm()));
  for (const patch of [{ opsCost: -1 }, { salaryTotal: 'abc', employeeCount: NaN }, { cardShare: 101 }]) assert.throws(() => operating.calculate({ ...operating.sample(false), ...patch }));
});
test('逐年变化基于上一年复合，后续默认持平', () => {
  const f = form(); f.growth = [10, 8, -10, 0, 0, 0, 0, 0, 0, 0];
  const rows = investment.calculate(f).rows;
  near(rows[0].ebitda, 110000); near(rows[1].ebitda, 118800); near(rows[2].ebitda, 106920); near(rows[9].ebitda, 106920);
});
test('直线折旧到期停止，只影响税与利润而非再次支出', () => {
  const f = form(); f.assets[1].life = 2; const r = investment.calculate(f);
  near(r.rows[0].depreciation, 100000); near(r.rows[0].netProfit, 0); near(r.rows[0].projectCash, 100000);
  near(r.rows[2].depreciation, 0); near(r.rows[2].netProfit, 75000); near(r.rows[2].projectCash, 75000);
});
test('固定租金影响净利润，按月均支付且不重复扣除', () => {
  const f = form(); f.incomeTaxRate = 0; f.rent = 12000; const r = investment.calculate(f);
  near(r.rows[0].projectCash, 88000); near(r.rows[0].rentPaid, 12000); near(r.rows[0].netProfit, 68000);
});
test('长租短付首期预付计入期初，全部租金仅支付一次', () => {
  const f = form(); Object.assign(f, { mode: 1, rent: 12000, frequency: 3, prepaidPeriods: 2, years: 3, incomeTaxRate: 0 });
  f.assets.forEach(a => a.life = 3);
  const r = investment.calculate(f);
  near(r.initialRent, 6000); near(r.initial, 206000);
  near(r.initialRent + r.rows.reduce((s, y) => s + y.rentPaid, 0), 36000);
  near(r.project.total, -200000 + 300000 - 36000);
});
test('递增租金首期跨年预付与应计租金分别正确', () => {
  const f = form(); Object.assign(f, { mode: 1, years: 3, rent: 12000, rentGrowth: 10, frequency: 12, prepaidPeriods: 2 });
  f.assets.forEach(a => a.life = 3);
  const r = investment.calculate(f); near(r.initialRent, 25200);
  near(r.rows[0].rentExpense, 12000); near(r.rows[1].rentExpense, 13200); near(r.rows[2].rentExpense, 14520);
  near(r.initialRent + r.rows.reduce((s, y) => s + y.rentPaid, 0), 39720);
});
test('付款越早净现值越低，利润不因付款节奏改变', () => {
  const f = form(); f.mode = 1; f.rent = 12000; f.frequency = 1; const monthly = investment.calculate(f);
  f.frequency = 12; const annually = investment.calculate(f);
  near(monthly.rows[0].netProfit, annually.rows[0].netProfit); assert.ok(annually.project.npv < monthly.project.npv);
});
test('两种贷款不影响项目回报，但改变股东现金流', () => {
  const f = form(), baseline = investment.calculate(f);
  f.loanAmount = 100000; f.loanRate = 3; f.repayment = 0;
  const annuity = investment.calculate(f); f.repayment = 1; const bullet = investment.calculate(f);
  for (const r of [annuity, bullet]) { near(r.project.irr, baseline.project.irr); near(r.project.npv, baseline.project.npv); near(r.rows.reduce((s, x) => s + x.principal, 0), 100000); }
  assert.notEqual(annuity.rows[0].shareholderCash, baseline.rows[0].shareholderCash);
  near(bullet.rows[0].principal, 0); near(bullet.rows[4].principal, 100000);
});
test('无息等额贷款本金均分；预测期末结清未偿本金', () => {
  const f = form(); Object.assign(f, { loanAmount: 100000, loanRate: 0, loanYears: 5, years: 2, repayment: 0 });
  f.assets.forEach(a => a.life = 2);
  const r = investment.calculate(f); near(r.rows[0].interest, 0); near(r.rows[0].principal, 20000); near(r.rows[1].principal, 80000); near(r.terminalDebt, 60000);
});
test('合同分成以折旧利息后的税前利润正数为基数', () => {
  const f = form(); f.mode = 2; f.shareRate = 20; const r = investment.calculate(f);
  near(r.rows[0].beforeSharing, 80000); near(r.rows[0].share, 16000); near(r.rows[0].netProfit, 48000);
  f.annualEbitda = -1000; near(investment.calculate(f).rows[0].share, 0);
});
test('合同分成下，融资仍不会影响项目回报', () => {
  const f = form(); f.mode = 2; const a = investment.calculate(f); f.loanAmount = 100000; const b = investment.calculate(f);
  near(a.project.npv, b.project.npv); near(a.project.irr, b.project.irr); assert.ok(b.rows[0].share < a.rows[0].share);
});
test('旧双方出资模式拒绝直接重算，不自动转换动态租金比例', () => {
  const f=form();Object.assign(f,{mode:3,cooperation:0,ownContribution:80000});
  const before=structuredClone(f);assert.throws(()=>investment.calculate(f),/双方出资合作模式已取消/);assert.deepEqual(f,before);
});
test('固定管理费合作扣管理费，不分权益', () => {
  const f = form(); f.mode = 3; f.cooperation = 1; f.managementFee = 10000; const r = investment.calculate(f);
  near(r.ownShare, 1); near(r.rows[0].netProfit, 52500); near(r.rows[0].share, 0);
});
test('切换合作模式后隐藏字段不能影响结果', () => {
  const f = form(); f.mode = 2; const a = investment.calculate(f); Object.assign(f, { rent: 999999, managementFee: 999999 }); const b = investment.calculate(f);
  near(a.project.npv, b.project.npv);
});
test('IRR/NPV 独立教科书样例，负收益率、多解和无解', () => {
  near(finance.irr([-100, 110]).value, .1); near(finance.irr([-100, 90]).value, -.1);
  near(finance.npv(.1, [-100, 110]), 0); near(finance.irr([-500000, 200000, 300000, 200000]).value, .1882, .00005);
  assert.equal(finance.irr([-100, -10]).value, null);
  assert.match(finance.irr([-100, 230, -132]).reason, /多个/);
});
test('静态回收期按月插值，无法回本和零投入不显示虚假收益率', () => {
  near(finance.payback([-100, 50, 100]), 1.5 / 12);
  assert.equal(finance.payback([-100, 20]), null);
  const f = form(); f.assets[1].amount = 0; const r = investment.calculate(f); assert.equal(r.project.irr, null); assert.equal(r.project.payback, null);
});
test('无经营收益、无效金额、超额贷款、错误年限不能计算', () => {
  assert.throws(() => investment.calculate(investment.initialForm()));
  for (const patch of [{ years: 21 }, { years: 0 }, { loanAmount: 999999 }, { annualEbitda: 'hello' }, { incomeTaxRate: 101 }, { mode: 1, frequency: 12, prepaidPeriods: 11 }]) assert.throws(() => investment.calculate({ ...form(), ...patch }));
});
test('负经营值和增减幅度的结果不被美化', () => {
  const f = form(); f.annualEbitda = -100; f.growth[0] = 10; const r = investment.calculate(f);
  near(r.rows[0].ebitda, -110); near(r.rows[0].tax, 0); assert.equal(r.project.irr, null); assert.ok(r.warnings.length);
});
test('报告不在经营页展示年度净利润，缩写带中文，投资表覆盖全部年份', () => {
  const op = reports.operating(operating.calculate(operating.sample(true)), '测试站');
  assert.ok(!JSON.stringify(op).includes('年度净利润')); assert.ok(JSON.stringify(op).includes('LNG（液化天然气）'));
  const f = form(); f.years = 20; f.growth = Array(20).fill(0); const inv = reports.investment(investment.calculate(f));
  assert.equal(inv.sections.length, 1); assert.equal(inv.annualTable.rows.length, 20); assert.ok(inv.metrics.some(m => m.label.includes('IRR（内部收益率'))); assert.ok(inv.metrics.some(m => m.label.includes('NPV（净现值')));
  assert.deepEqual(inv.terms.map(t=>t.id), ['irr','npv']);
  assert.ok(require('../lib/terms').get('net'));
});
test('20 年报告为一个完整长图，无截断、边界不溢出，保留品牌和术语', () => {
  const f = form(); f.years = 20; f.growth = Array(20).fill(0);
  const r = reports.investment(investment.calculate(f)); const plan = layout(r, (t, size) => t.length * size);
  const all = plan.items.filter(l=>l.kind==='text'); assert.ok(plan.height > 1100);
  assert.ok(all.every(l => l.y + l.size * 1.5 <= plan.height && l.x + l.text.length*l.size <= 711));
  assert.equal(r.annualTable.rows.at(-1).year,20); assert.ok(all.some(l => l.text.includes('逐年利润与现金流'))); assert.ok(all.some(l => l.text.includes('本报告术语说明')));
  assert.ok(all.some(l => l.text.includes('在这里，读懂中国加油站。')));
  assert.equal(plan.items.filter(l=>l.kind==='image').length,2);
  const size=require('../lib/report-layout').dimensions(plan); assert.ok(size.height<=16000 && size.width>400);
});
test('近期只保留 5 条，3.0 继续读取 2.0 历史并区分 1.x 旧记录', () => {
  const data = new Map(); global.wx = { getStorageSync: k => data.get(k) || '', setStorageSync: (k,v) => data.set(k, structuredClone(v)) };
  const s = require('../lib/storage');
  for(let i=0;i<7;i++) s.add(s.KEYS.recent, s.record(operating.sample(false), 'people', 'month', '站'+i), 5);
  assert.equal(s.list(s.KEYS.recent).length,5); assert.equal(s.list(s.KEYS.history).length,0);
  const legacy = { id:'old', form:{...operating.sample(false),landRent:1000000,totalInvestment:300000}, periodKey:'month' };
  const source = s.source(legacy, 'saved'); near(source.annualEbitda, operating.calculate(operating.sample(false)).annualEbitda); assert.equal(source.legacyInvestment,300000); assert.equal(source.legacy,true);
  for (const version of ['2.0.0', '3.0.0']) {
    const modern = s.source({ ...legacy, version }, 'saved');
    assert.equal(modern.legacy, false); assert.equal(modern.legacyInvestment, 0);
    assert.equal(modern.version, '3.0.0');
  }
  assert.equal(s.record(operating.sample(false), 'people', 'year').version, '3.0.0');
  delete global.wx;
});
