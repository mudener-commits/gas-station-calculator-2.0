const { test } = require('node:test');
const assert = require('node:assert/strict');
const inv = require('../lib/investment');
const reports = require('../lib/report');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-5, `${a} != ${b}`);
function form() { return {...inv.initialForm(), annualEbitda: 1000000, mode: 4, rent: 120000}; }
test('流动资金默认50万，与首期两年租金分别计入期初且只在期末收回', () => {
  const f=form(), r=inv.calculate(f), b=inv.calculate({...f,workingCapital:0});
  assert.equal(f.workingCapital,500000); near(r.initialRent,240000); near(r.initial,740000);
  near(r.projectFlows[0],-740000); near(r.ownInitial,740000);
  for(let i=1;i<r.projectFlows.length-1;i++) near(r.projectFlows[i],b.projectFlows[i]);
  near(r.projectFlows.at(-1)-b.projectFlows.at(-1),500000);
  near(r.rows.at(-1).projectCash-b.rows.at(-1).projectCash,500000);
  for(let i=0;i<r.rows.length;i++) { near(r.rows[i].netProfit,b.rows[i].netProfit); near(r.rows[i].tax,b.rows[i].tax); }
  near(r.project.total,b.project.total);
  near(r.project.npv-b.project.npv,-500000+500000/1.07**10);
});
test('流动资金回收不随经营亏损再次扣减，且不作利润或所得税收入', () => {
  const f={...form(),annualEbitda:-100000},r=inv.calculate(f),b=inv.calculate({...f,workingCapital:0});
  near(r.workingCapitalRecovery,500000);near(r.projectFlows.at(-1)-b.projectFlows.at(-1),500000);
  near(r.rows.at(-1).netProfit,b.rows.at(-1).netProfit);near(r.rows.at(-1).tax,0);
});
test('贷款不改变项目回收，取消出资分配后我方全额回收流动资金', () => {
  const f=form(),base=inv.calculate(f), debt=inv.calculate({...f,loanAmount:600000});
  near(base.project.npv,debt.project.npv);near(debt.ownInitial,140000);
  const joint={...f,mode:3,ownContribution:200000};
  const r=inv.calculate(joint);near(r.ownShare,1);
  near(r.shareholderFlows.at(-1),r.projectFlows.at(-1));
  near(r.partnerInitial,0);
});
test('旧方案未填流动资金保持原计算，明确零值保留，非法数值拒绝', () => {
  const old=form();delete old.workingCapital;const before=structuredClone(old);
  near(inv.calculate(old).initial,240000);assert.deepEqual(old,before);
  near(inv.calculate({...old,workingCapital:0}).initial,240000);
  for(const value of [-1,'abc',Infinity]) assert.throws(()=>inv.calculate({...old,workingCapital:value}));
});
test('两版报告流动资金口径一致，负现金流不直接判定资金不足', () => {
  const r=inv.calculate(form()),full=reports.investment(r),brief=reports.brief(full);
  assert.ok(full.sections[0].rows.some(x=>x.label==='期末流动资金回收'));
  assert.ok(brief.sections[0].rows.some(x=>x.label==='流动资金（期初投入）'));
  assert.deepEqual(full.notes,brief.notes);assert.match(full.notes[0],/期末全额收回/);
  assert.ok(r.warnings.some(x=>x.includes('不等于实际资金不足')));
});
