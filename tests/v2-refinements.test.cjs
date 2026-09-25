const { test } = require('node:test');
const assert = require('node:assert/strict');
const op = require('../lib/operating'), inv = require('../lib/investment'), reports = require('../lib/report');
const { layout, dimensions } = require('../lib/report-layout');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);
function form() { return { ...inv.initialForm(), workingCapital: 0, annualEbitda: 1000000, rent: 120000, mode: 4, incomeTaxRate: 0 }; }
test('新默认值和示例一致，不替换用户已有的数值', () => {
  for (const f of [op.initialForm(),op.sample(true)]) { assert.equal(f.insuranceCost,3500); assert.equal(f.landUseTax,10000); }
  assert.equal(op.cleanForm({insuranceCost:0}).insuranceCost,0);
  const f=inv.initialForm();assert.equal(f.discountRate,7);assert.equal(f.shareRate,50);assert.equal(f.repayment,1);
  assert.ok(f.assets.every(a=>a.life===f.years)); assert.equal(inv.MODES[4],'长租长付');
});
test('每升与每公斤费用按原始销量换算，保留每吨费用、不计算吨均收益', () => {
  const r=op.calculate(op.sample(true));
  r.rows.forEach(x=>{near(x.costPerUnit*x.daily*365,x.allocatedCost); assert.equal('ebitdaPerTon' in x,false);});
  near(r.rows[0].costPerUnit,r.rows[0].costPerTon*.73/1000);
  near(r.rows[2].costPerUnit,r.rows[2].costPerTon*.84/1000);
  near(r.rows[3].costPerUnit,r.rows[3].costPerTon/1000);
  const report=reports.operating(r); const costs=report.sections.find(s=>s.title==='销量与升油费用').rows.filter(x=>x.highlight);
  assert.equal(costs.length,4);assert.match(costs[3].value,/元\/公斤/);assert.match(costs[0].value,/元\/升（.*元\/吨）/);
  assert.ok(report.sections.flatMap(s=>s.rows).some(x=>x.label==='应交增值税额'));
  assert.ok(!JSON.stringify(report).includes('吨均'));
  const zero=op.sample(false);zero.volDiesel=0;assert.match(reports.operating(op.calculate(zero)).sections.find(s=>s.title==='销量与升油费用').rows.at(-1).value,/无销量/);
});
test('十年两年一付：期初和第3、5、7、9年付款，现金流时点准确', () => {
  const f=form(), plan=inv.rentPlan(f), r=inv.calculate(f);
  assert.deepEqual(plan.paid.map((v,i)=>v?i:null).filter(x=>x!==null),[0,24,48,72,96]);
  near(r.initialRent,240000);
  assert.deepEqual(r.rows.filter(y=>y.rentPaid>0).map(y=>y.year),[3,5,7,9]);
  r.rows.forEach(y=>{near(y.rentExpense,120000);near(y.netProfit,880000);});
  near(r.projectFlows[24],1000000/12-240000);near(r.projectFlows[25],1000000/12);
  near(r.project.total,10000000-1200000);
  near(r.project.total,r.rows.at(-1).projectTotal);near(r.shareholder.total,r.rows.at(-1).shareholderTotal);
  near(r.initialRent+r.rows.reduce((s,y)=>s+y.rentPaid,0),1200000);
});
test('三年与五年一付、递增租金、末期不足周期均不多付或漏付', () => {
  for (const cycle of [2,3,5]) {
    const f=form();f.paymentYears=cycle;f.rentGrowth=10;
    const r=inv.calculate(f),p=inv.rentPlan(f);
    near(r.initialRent+r.rows.reduce((s,y)=>s+y.rentPaid,0),p.expense.reduce((s,x)=>s+x,0));
    const last=Math.floor((f.years-1)/cycle)*cycle*12;
    near(p.paid[last],p.expense.slice(last).reduce((s,x)=>s+x,0));
    near(r.project.total,r.rows.at(-1).projectTotal);
  }
});
test('预付越早净现值越低，但年度利润相同', () => {
  const f=form();f.paymentYears=2;const a=inv.calculate(f);f.paymentYears=5;const b=inv.calculate(f);
  a.rows.forEach((y,i)=>near(y.netProfit,b.rows[i].netProfit));assert.ok(a.project.npv>b.project.npv);
});
test('折旧超过经营期、非法付款周期被拒绝，两个还款选项仍有效', () => {
  const f=form();f.assets[0].life=11;assert.throws(()=>inv.calculate(f),/折旧年限/);f.assets[0].life=10;
  for(const value of [0,-1,2.5,11,'abc']){f.paymentYears=value;assert.throws(()=>inv.calculate(f));}
  f.paymentYears=2;f.loanAmount=100000;
  const bullet=inv.calculate(f);f.repayment=0;const annuity=inv.calculate(f);
  near(bullet.rows[0].principal,0);assert.ok(annuity.rows[0].principal>0);
  near(bullet.project.npv,annuity.project.npv);
});
test('长租长付报告包含专用解释、付款频率和红色关键数据', () => {
  const r=reports.investment(inv.calculate(form()));assert.ok(require('../lib/terms').get('longpay'));
  assert.deepEqual(r.terms,reports.brief(r).terms);
  assert.ok(r.sections[0].rows.some(x=>x.label==='租金支付安排'&&x.value.includes('每 2 年')));
  assert.ok(r.annualTable.columns.find(x=>x.key==='netProfit').highlight);
  const plan=layout(r,(s,z)=>s.length*z);const text=plan.items.filter(x=>x.kind==='text');
  assert.ok(text.some(x=>x.text==='在这里，读懂中国加油站。'));
  assert.ok(text.some(x=>x.color==='#c93643'));assert.equal(plan.items.filter(x=>x.kind==='image').length,2);
  assert.ok(dimensions(plan,8192).height<=8192);
});
test('年度核心表逐项对应计算结果，金额统一万元，保留负值和全部年份', () => {
  const f=form();f.years=20;f.growth=Array(20).fill(0);f.annualEbitda=-100000;
  const result=inv.calculate(f),report=reports.investment(result),table=report.annualTable;
  assert.equal(report.sections.length,1);assert.equal(table.rows.length,20);assert.equal(table.columns.length,6);
  assert.equal(table.unit,'单位：万元');
  table.rows.forEach((row,i)=>row.cells.forEach(cell=>{
    assert.equal(cell.value,cell.key==='year'?String(i+1):(result.rows[i][cell.key]/10000).toFixed(2));
  }));
  assert.match(table.rows[0].cells.find(x=>x.key==='netProfit').value,/^-/);
  assert.ok(!JSON.stringify(table.columns).includes('depreciation'));
  assert.ok(table.note.includes('包含初始出资'));
  const plan=layout(report,(s,z)=>s.length*z);assert.ok(plan.height<10000);
});
test('升油费用主次值完整保留，公众号名称与宋体宣传语在同一行', () => {
  const report=reports.operating(op.calculate(op.sample(true)));
  const costs=report.sections.find(s=>s.title==='销量与升油费用').rows.filter(r=>r.unitCost);
  assert.equal(costs.length,4);
  for(const r of costs){assert.equal(r.value,r.primaryValue+r.secondaryValue);assert.match(r.primaryValue,/元\/(升|公斤)$/);assert.match(r.secondaryValue,/^（.*元\/吨）$/);}
  const plan=layout(report,(s,z)=>s.length*z),lines=plan.items.filter(x=>x.kind==='text');
  const account=lines.find(x=>x.text==='公众号 · 加油站漫谈'),slogan=lines.find(x=>x.text==='在这里，读懂中国加油站。');
  assert.ok(account&&slogan);assert.ok(Math.abs(account.y-slogan.y)<=2);assert.ok(slogan.x>account.x);assert.match(slogan.fontFamily,/Songti/);
});
