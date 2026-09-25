const { test } = require('node:test');
const assert = require('node:assert/strict');
const be = require('../lib/break-even'), inv = require('../lib/investment');
function form(years = 5) {
  const f = inv.initialForm(); f.years = years; f.growth = Array(years).fill(0);
  f.assets.forEach(a => a.life = years); f.workingCapital = 0; return f;
}
function gas() {
  const p = be.initialInputs(); p.forEach(x => x.ratio = 0); p[0].ratio = 100;
  p[0].margin = 1.13; p[0].cost = 0.3; return p;
}
function close(a,b,tol=1e-5) { assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`); }
test('独立算例：含税毛利1.13、单位费用0.3，折旧与租金合计20万', () => {
  const f=form(); f.rent=100000; f.assets[0].amount=500000;
  const r=be.calculate(f,gas()); close(r.accounting.volumes[0].daily,200000/365/0.7);
  close(r.accounting.annualEbitda,200000); assert.ok(r.investment.volumes[0].daily>r.accounting.volumes[0].daily);
  assert.equal(f.annualEbitda,'');
});
test('独立月度年金现值公式：无税无租、流动资金全额回收，NPV平衡', () => {
  const f=form(2); f.discountRate=12; f.incomeTaxRate=0; f.otherInitial=120000;f.workingCapital=50000;
  const mr=Math.pow(1.12,1/12)-1, pvFactor=(1-Math.pow(1+mr,-24))/mr;
  const annual=(170000-50000/Math.pow(1.12,2))*12/pvFactor;
  const r=be.calculate(f,gas()); close(r.investment.annualEbitda,annual);
  close(r.investment.volumes[0].daily,annual/365/0.7); close(r.investment.residual,0);
});
test('配比按原始升与公斤数值，LNG独立税率，单位费用不按吨误算', () => {
  const f=form(1);f.rent=36500; const p=gas(); p[0].ratio=60;p[3].ratio=40;p[3].margin=1.09;p[3].cost=0.1;
  const r=be.calculate(f,p), scale=100/(.6*.7+.4*.9);
  close(r.accounting.volumes[0].daily,scale*.6);close(r.accounting.volumes[1].daily,scale*.4);
  assert.equal(r.accounting.volumes[1].unit,'公斤'); assert.equal(r.accounting.volumes.length,2);
  assert.deepEqual(be.initialInputs().map(x=>x.cost),[.3,.3,.1,.1]);
});
test('两年预付比月付要求更高投资销量，折旧利润平衡不变', () => {
  const f=form(6);f.rent=200000;f.assets[0].amount=1500000;f.workingCapital=500000;
  const monthly=be.calculate(f,gas());f.mode=4;f.paymentYears=2;const prepaid=be.calculate(f,gas());
  close(monthly.accounting.annualEbitda,prepaid.accounting.annualEbitda);
  assert.ok(prepaid.investment.annualEbitda>monthly.investment.annualEbitda);
});
test('每种合同、两种还款方式及年度修正：根的两侧跨越目标，期末本金结清', () => {
  for(let mode=0;mode<5;mode++) for(let repayment=0;repayment<2;repayment++) {
    const f=form(3);Object.assign(f,{mode,repayment,rent:180000,loanAmount:400000,loanYears:5,managementFee:150000,workingCapital:500000,growth:[10,-8,3]});f.assets[0].amount=1000000;
    const r=be.calculate(f,gas());
    for(const kind of ['accounting','investment']) {
      const root=r[kind];assert.equal(root.status,'solved');
      const below=inv.calculate({...f,annualEbitda:root.annualEbitda-1});
      const above=inv.calculate({...f,annualEbitda:root.annualEbitda+1});
      const select=x=>kind==='accounting'?x.averages.netProfit:x.shareholder.npv;
      assert.ok(select(below)<0);assert.ok(select(above)>0);close(root.residual,0,1e-4);
      assert.ok(above.terminalDebt>0);
    }
  }
});
test('零投入、非正贡献、全额业主租金和完全停止经营不会伪造有限销量', () => {
  const f=form();const zero=be.calculate(f,gas());assert.equal(zero.accounting.volumes[0].daily,0);assert.equal(zero.investment.volumes[0].daily,0);
  f.otherInitial=100000;f.rent=10000;const p=gas();p[0].margin=.1;
  assert.equal(be.calculate(f,p).investment.status,'unreachable');
  f.mode=2;f.shareRate=100;assert.equal(be.calculate(f,gas()).investment.status,'unreachable');
  f.mode=0;f.growth[0]=-100;assert.equal(be.calculate(f,gas()).accounting.status,'unreachable');
});
test('超大增长在数值边界内查找，无解显示未找到；输入错误明确拒绝', () => {
  const f=form(20);f.rent=10000;f.otherInitial=100000;f.growth.fill(1000);
  const r=be.calculate(f,gas());assert.equal(r.investment.status,'solved');assert.ok(Number.isFinite(r.investment.volumes[0].daily));
  const p=gas();p[0].ratio=99;assert.throws(()=>be.calculate(f,p),/100%/);p[0].ratio=100;p[0].cost=-1;assert.throws(()=>be.calculate(f,p),/经营费用/);
  p[0].cost='';assert.throws(()=>be.calculate(f,p),/经营费用/);
  f.loanAmount=1e9;assert.throws(()=>be.calculate(f,gas()),/贷款金额不得超过/);
});
