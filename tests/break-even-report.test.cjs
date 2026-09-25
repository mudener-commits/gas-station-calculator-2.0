const {test}=require('node:test'),assert=require('node:assert/strict');
const be=require('../lib/break-even'),inv=require('../lib/investment'),reports=require('../lib/report');
const {layout,dimensions}=require('../lib/report-layout');
function sample(){const f=inv.initialForm();Object.assign(f,{name:'测试站',mode:4,rent:200000,loanAmount:500000});f.assets[0].amount=1000000;const p=be.initialInputs();p[0].ratio=40;p[3].ratio=10;return {f,p};}
test('两种报告复用真实销量快照，单位不混算，保留假设和名称',()=>{
 const {f,p}=sample(),r=be.calculate(f,p),report=reports.breakEven(r),before=structuredClone(report),brief=reports.brief(report);
 assert.equal(report.type,'break-even');assert.equal(report.name,'测试站');assert.equal(report.time.includes('日期未知'),false);
 for(const [i,kind]of ['accounting','investment'].entries())for(const v of r[kind].volumes)assert.ok(report.metrics[i].value.includes(v.dailyText+' '+v.unit+'/日'));
 assert.deepEqual(brief.metrics,report.metrics);assert.deepEqual(brief.notes,report.notes);assert.deepEqual(reports.conciseExplanations(report),report);assert.deepEqual(report,before);
 assert.match(JSON.stringify(brief.sections),/公斤/);assert.match(JSON.stringify(report.sections),/2 年期初预付/);assert.equal(report.annualTable,undefined);
 f.rent=900000;p[0].margin=10;assert.deepEqual(reports.breakEven(r),report);assert.equal(r.form.rent,200000);
});
test('无解与零销量原因在完整和简要报告保留，不伪造零销量',()=>{
 const {f,p}=sample();p.forEach(x=>x.margin=0);const none=reports.breakEven(be.calculate(f,p));
 for(const report of [none,reports.brief(none)]){assert.ok(report.metrics.every(m=>m.value==='未找到可达平衡销量'));assert.match(report.notes.join(''),/综合单位贡献不为正/);}
 const zero=inv.initialForm();zero.workingCapital=0;const r=reports.breakEven(be.calculate(zero,be.initialInputs()));
 assert.match(r.metrics[0].value,/0.00 升\/日/);assert.match(r.notes.join(''),/零销量已满足/);
});
test('五类合同的有效条款进入报告，贷款与折旧条件可追溯',()=>{
 for(let mode=0;mode<5;mode++){
 const {f,p}=sample();f.mode=mode;f.managementFee=120000;f.growth[0]=8;
 const report=reports.breakEven(be.calculate(f,p)),text=JSON.stringify(report.sections);
 assert.match(text,/贷款年利率/);assert.match(text,/折旧 10 年/);assert.match(text,/第 1 年较上年/);assert.match(text,/8%/);
 if(mode===2){assert.match(text,/业主动态租金比例/);assert.ok(!text.includes('首年租金成本'));}
 if(mode===3){assert.match(text,/年度固定管理费/);assert.ok(!text.includes('首年租金成本'));}
 }
});
test('20年四品种完整版及简要版布局完整，指标分组且文字不出界',()=>{
 const {f,p}=sample();f.years=20;f.growth=Array.from({length:20},(_,i)=>i%2?8:-5);f.name='长名称油气站盈亏平衡销量报告'.repeat(2);
 const full=reports.breakEven(be.calculate(f,p));
 for(const report of [full,reports.brief(full)]){
 const measure=(t,size)=>Array.from(t).reduce((n,c)=>n+(/[\x00-\x7f]/.test(c)?.55:1)*size,0),plan=layout(report,measure),d=dimensions(plan);
 assert.ok(d.height<=16000);assert.ok(plan.items.some(x=>x.kind==='text'&&x.text.includes('投资回报平衡销量')));
 assert.ok(plan.items.some(x=>x.kind==='text'&&x.text.includes('LNG')));assert.equal(plan.items.filter(x=>x.kind==='image').length,2);
 for(const item of plan.items){assert.ok(item.y>=0&&item.y<plan.height);if(item.kind==='text')assert.ok(item.x+measure(item.text,item.size)<=751,item.text);}
 }
});
