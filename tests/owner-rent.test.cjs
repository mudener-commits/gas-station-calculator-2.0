const {test}=require('node:test'),assert=require('node:assert/strict');
const inv=require('../lib/investment'),reports=require('../lib/report');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function form(){const f=inv.initialForm();Object.assign(f,{annualEbitda:100000,mode:2,loanAmount:100000});f.assets[0].amount=200000;return f;}
test('业主分红归入租金，利润和现金各扣一次，不再按权益分配',()=>{
 const r=inv.calculate(form()),y=r.rows[0];near(r.ownShare,1);
 near(y.ownerRent,38500);near(y.rentExpense,38500);near(y.rentPaid,38500);
 near(y.projectOwnerRent,40000);near(y.projectRentExpense,40000);
 near(y.netProfit,28875);near(y.projectAnnualCash,50000);near(y.shareholderAnnualCash,48875);
 near(y.projectCash,50000);near(y.shareholderCash,48875);
 const noDebt=inv.calculate({...form(),loanAmount:0});near(noDebt.project.npv,r.project.npv);near(noDebt.rows[0].ownerRent,40000);
 near(noDebt.averages.projectCash,noDebt.averages.shareholderCash);
});
test('动态租金亏损为零，分配比例0和100边界不二次扣除',()=>{
 const f=form();
 const loss=inv.calculate({...f,annualEbitda:-100000});near(loss.rows[0].ownerRent,0);near(loss.rows[0].projectOwnerRent,0);
 const zero=inv.calculate({...f,shareRate:0});near(zero.rows[0].ownerRent,0);near(zero.rows[0].netProfit,57750);
 const all=inv.calculate({...f,shareRate:100});near(all.rows[0].ownerRent,77000);near(all.rows[0].netProfit,0);near(all.rows[0].shareholderAnnualCash,20000);
});
test('业主租金在完整和简要报告明确列示，真实融资与无融资口径分别说明',()=>{
 const result=inv.calculate(form()),full=reports.investment(result),brief=reports.brief(full);
 assert.equal(result.modeName,'动态租金（业主分红）');assert.equal(inv.MODES[3],'固定管理费');
 for(const report of [full,brief]){
  assert.ok(report.sections[0].rows.some(x=>x.label==='租金（业主分红）·年均'));
  assert.ok(report.notes.some(n=>n.includes('动态租金扣除一次')));
  assert.ok(!report.sections[0].rows.some(x=>x.label==='我方权益比例'));
 }
 assert.ok(full.sections[0].rows.some(x=>x.label==='无融资口径业主租金·年均'));
 assert.deepEqual(full.notes,brief.notes);
});
test('历史双方出资报告保留原值与历史口径，不能换成动态租金说明',()=>{
 const old=reports.investment(inv.calculate(form()));old.sections[0].rows.push({label:'我方权益比例',value:'40%'});
 old.metrics[0].value='旧值';const snapshot=structuredClone(old);
 const full=reports.conciseExplanations(old),brief=reports.brief(full);
 assert.deepEqual(old,snapshot);assert.equal(full.metrics[0].value,'旧值');
 assert.match(full.notes[0],/原结果按原权益比例分配/);assert.equal(full.retiredJoint,true);
 assert.deepEqual(full.notes,brief.notes);assert.deepEqual(reports.conciseExplanations(brief),brief);
 const missing=form();missing.mode=3;delete missing.cooperation;assert.throws(()=>inv.calculate(missing),/已取消/);
});
