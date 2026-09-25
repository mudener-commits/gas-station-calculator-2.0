const {test}=require('node:test');
const assert=require('node:assert/strict');
const inv=require('../lib/investment'),reports=require('../lib/report'),terms=require('../lib/terms');
const {money}=require('../lib/ui');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const sum=(rows,key)=>rows.reduce((s,r)=>s+r[key],0);
function form(){
  const f=inv.initialForm();Object.assign(f,{annualEbitda:1000000,years:3,mode:4,rent:120000,rentGrowth:10,otherInitial:100000,loanAmount:400000,loanYears:5,growth:[0,10,-10]});
  f.assets.forEach(a=>a.life=3);f.assets[0].amount=600000;return f;
}
test('三年独立算例：年均利润、租金年度归属、贷款期末结清和全周期净收益',()=>{
  const r=inv.calculate(form());
  near(r.initialRent,252000);near(r.initial,1452000);near(r.ownInitial,1052000);
  [501000,567000,474600].forEach((v,i)=>near(r.rows[i].netProfit,v));
  [710000,776000,683600].forEach((v,i)=>near(r.rows[i].projectAnnualCash,v));
  [701000,767000,274600].forEach((v,i)=>near(r.rows[i].shareholderAnnualCash,v));
  near(r.averages.netProfit,514200);near(r.averages.projectCash,723200);near(r.averages.shareholderCash,1742600/3);
  near(r.project.total,1469600);near(r.shareholder.total,1442600);near(r.terminalDebt,400000);
});
test('所有合作方式与还款方式：年均回笼、实际现金流和期末累计逐项勾稽',()=>{
  for(const mode of [0,1,2,3,4])for(const repayment of [0,1])for(const negative of [false,true])for(const cooperation of [0,1]){
    if(mode===3&&cooperation===0)continue;
    const f=form();Object.assign(f,{mode,repayment,cooperation,annualEbitda:negative?-100000:1000000,ownContribution:320000,managementFee:10000});
    const r=inv.calculate(f),own=r.ownShare,years=Number(f.years);
    near(r.averages.netProfit*years,sum(r.rows,'netProfit'));
    near(r.averages.projectCash*years,sum(r.rows,'projectCash')-r.initialRent-r.workingCapitalRecovery);
    near(r.averages.shareholderCash*years,sum(r.rows,'shareholderCash')-(r.initialRent+r.workingCapitalRecovery)*own);
    near(r.project.total,-r.initial+sum(r.rows,'projectCash'));
    near(r.shareholder.total,-r.ownInitial+sum(r.rows,'shareholderCash'));
    near(r.shareholder.total,sum(r.rows,'ownNetProfit')-Number(f.otherInitial)*own);
    near(r.project.total,r.rows.at(-1).projectTotal);near(r.shareholder.total,r.rows.at(-1).shareholderTotal);
    near(r.project.total,r.projectFlows.reduce((s,v)=>s+v,0));near(r.shareholder.total,r.shareholderFlows.reduce((s,v)=>s+v,0));
  }
});
test('长付与月付年均回笼相同，实际付款时点和NPV保持不同',()=>{
  const f=form();f.loanAmount=0;const long=inv.calculate(f),monthly=inv.calculate({...f,mode:0});
  near(long.averages.projectCash,monthly.averages.projectCash);near(long.averages.shareholderCash,monthly.averages.shareholderCash);
  near(long.averages.netProfit,monthly.averages.netProfit);near(long.project.total,monthly.project.total);
  assert.notDeepEqual(long.projectFlows,monthly.projectFlows);assert.ok(long.project.npv<monthly.project.npv);
});
test('年均回笼不包含流动资金回收、期初资产或其他投入，不受折现率影响',()=>{
  const f=form(),base=inv.calculate(f);
  for(const patch of [{workingCapital:0},{workingCapital:1500000},{otherInitial:300000},{discountRate:15}]){
    const r=inv.calculate({...f,...patch});near(r.averages.projectCash,base.averages.projectCash);near(r.averages.shareholderCash,base.averages.shareholderCash);near(r.averages.netProfit,base.averages.netProfit);
  }
  const noTax={...f,incomeTaxRate:0,loanAmount:0};const a=inv.calculate(noTax);
  const extra=structuredClone(noTax);extra.assets[0].amount=900000;const b=inv.calculate(extra);
  near(a.averages.projectCash,b.averages.projectCash);near(a.averages.shareholderCash,b.averages.shareholderCash);assert.ok(a.averages.netProfit>b.averages.netProfit);
});
test('改变融资不改变项目年均回笼，固定管理费模式不按出资比例分配',()=>{
  const f=form(),a=inv.calculate({...f,loanAmount:0}),b=inv.calculate(f);
  near(a.averages.projectCash,b.averages.projectCash);assert.notEqual(a.averages.shareholderCash,b.averages.shareholderCash);
  const joint=inv.calculate({...f,mode:3,ownContribution:320000});near(joint.ownShare,1);
  near(joint.averages.shareholderCash,(sum(joint.rows,'netProfit')+sum(joint.rows,'depreciation')-sum(joint.rows,'principal'))/3);
});
test('报告年均指标与明细一致、两版说明一致、期望回报可见且IRR放最后',()=>{
  const result=inv.calculate(form()),full=reports.investment(result),brief=reports.brief(full);
  assert.equal(full.metrics[0].label,'年均净利润（项目整体）');assert.equal(full.metrics[0].value,money(514200));
  assert.equal(full.metrics[1].value,money(723200));assert.match(full.metrics[1].label,/年度净现金回笼/);
  assert.equal(full.metrics[2].value,money(1742600/3));assert.equal(full.metrics[4].value,money(result.rows.at(-1).shareholderTotal));
  assert.deepEqual(brief.metrics,full.metrics);assert.deepEqual(brief.notes,full.notes);assert.deepEqual(brief.terms,full.terms);
  for(const report of [full,brief]){
    assert.ok(report.sections[0].rows.some(r=>r.label==='年折现率（期望年回报率）'&&r.value==='7%'));
    assert.ok(report.notes.some(n=>n.includes('经营期内年均值')));
    assert.ok(report.notes.some(n=>n.includes('不含期初投入及流动资金返还')));
    assert.match(report.terms.find(t=>t.id==='npv').text,/不是项目总利润/);
    assert.ok(report.metrics.slice(-2).every(m=>m.term==='irr'));
    assert.ok(report.metrics.every(m=>terms.get(m.term)));
    assert.deepEqual(reports.conciseExplanations(report),report);
  }
  assert.equal(full.annualTable.columns.length,6);assert.equal(full.annualTable.rows.length,3);
  assert.equal(full.annualTable.rows[0].cells[2].value,'50.10');
});
test('亏损和零初始投入不伪造回收期，20年指标仍由全部年度平均得到',()=>{
  const f=form();f.years=20;f.growth=Array(20).fill(1);const r=inv.calculate(f);near(r.averages.netProfit,sum(r.rows,'netProfit')/20);
  const loss=inv.calculate({...form(),annualEbitda:-100000});assert.ok(loss.averages.netProfit<0);assert.ok(loss.averages.projectCash<0);
  const zero=inv.initialForm();Object.assign(zero,{workingCapital:0,annualEbitda:0});
  const report=reports.investment(inv.calculate(zero));assert.ok(report.metrics.some(m=>m.value==='初始投入为 0，不适用'));
});
