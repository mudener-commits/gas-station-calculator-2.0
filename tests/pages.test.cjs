const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const compiler = ['/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec/wcc', '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc'].find(fs.existsSync) || '';
function environment() {
  const stored = new Map(), calls = [], modals = [];
  global.wx = { getStorageSync: k => stored.get(k) || '', setStorageSync: (k,v) => stored.set(k, structuredClone(v)),
    showShareMenu() {}, showToast(x) { calls.push(x); }, pageScrollTo(x) { calls.push(x); },
    showModal(x) { modals.push(x); }, navigateTo(x) { calls.push(x); } };
  function load(name) {
    const file = path.join(root, 'pages',name,name+'.js'); let instance;
    vm.runInNewContext(fs.readFileSync(file,'utf8'), { require: createRequire(file), Page: p => { instance=p; }, wx:global.wx, console });
    instance.data = structuredClone(instance.data);
    instance.setData = function(patch, cb) {
      for (const [key,value] of Object.entries(patch)) {
        const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;
        while(parts.length>1) target=target[parts.shift()]; target[parts[0]]=structuredClone(value);
      }
      if(cb) cb();
    };
    return instance;
  }
  return { stored, calls, modals, load };
}
const event = (key, value) => ({ currentTarget:{dataset:{key}},detail:{value} });
test('两计算器自有站勾选切换、资金预览、草稿恢复及旧条件保留', () => {
  const env = environment(), storage = require('../lib/storage');
  for (const name of ['investment', 'break-even']) {
    const p = env.load(name); p.onLoad({}); p.sample();
    p.choice(event('mode', '4')); p.input(event('rent', '200000'));
    assert.equal(p.data.funding, '290.00 万元');
    if (name === 'investment') p.calculate(); else p.calculateBreakEven();
    p.selfOwnedChange({ detail: { value: ['self-owned'] } });
    assert.equal(p.data.form.selfOwned, true); assert.equal(p.data.funding, '250.00 万元');
    assert.equal(name === 'investment' ? p.data.result : p.data.breakEvenResult, null);
    assert.equal(p.data.form.rent, '200000'); assert.equal(p.data.form.mode, 4);
    if (name === 'investment') { p.calculate(); p.savePlan(); }
    else p.calculateBreakEven();
    p.report(); assert.match(JSON.stringify(storage.read(storage.KEYS.report)), /自有站经营/);
    p.onHide(); const restored = env.load(name); restored.onLoad({});
    assert.equal(restored.data.form.selfOwned, true);
    restored.selfOwnedChange({ detail: { value: [] } }); assert.equal(restored.data.funding, '290.00 万元');
    assert.equal(restored.data.form.rent, '200000');
    if (name === 'investment') {
      restored.restorePlan({ currentTarget: { dataset: { id: p.data.plans[0].id } } });
      assert.equal(restored.data.form.selfOwned, true);
    }
  }
  assert.equal(env.modals.length, 0); delete global.wx;
});
test('历史与默认的不含税价格恢复为含税输入，原存档不修改', () => {
  const env=environment(),p=env.load('index'),o=require('../lib/operating'),s=require('../lib/storage');
  const old={...o.sample(true),customPrice:true,taxMode:'net'};
  s.write(s.KEYS.history,[{id:'net-old',form:old,wageMode:'people',periodKey:'year'}]);
  p.restore({currentTarget:{dataset:{id:'net-old'}}});
  assert.equal(p.data.form.taxMode,'gross');assert.match(p.data.priceConversionNote,/自动换算/);
  assert.ok(Math.abs(o.calculate(p.data.form).annualEbitda-o.calculate(old).annualEbitda)<1e-6);
  assert.equal(s.list(s.KEYS.history)[0].form.taxMode,'net');
  s.write(s.KEYS.defaults,{form:old,wageMode:'people'});p.applyDefaults();
  assert.equal(p.data.form.taxMode,'gross');assert.equal(s.defaults().form.taxMode,'net');
  p.sample();assert.equal(p.data.priceConversionNote,'');
  assert.ok(!fs.readFileSync(path.join(root,'pages/index/index.wxml'),'utf8').includes('bindchange="taxMode"'));
  delete global.wx;
});
test('利润→近期选择→投资→保存恢复→报告完整路径', () => {
  const env=environment(); const p=env.load('index');p.onLoad();p.sample();
  p.nameInput(event('', '测试油站'));
  p.calculate({currentTarget:{dataset:{period:'month'}}});
  assert.ok(p.data.result);p.saveHistory();assert.equal(p.data.history.length,1);
  const i=env.load('investment');i.onLoad({recent:p.data.record.id});
  assert.equal(i.data.source.name,'测试油站'); assert.equal(i.data.form.annualEbitda,p.data.result.annualEbitda);
  i.assetInput({currentTarget:{dataset:{index:0,key:'amount'}},detail:{value:'1000000'}});
  i.growthInput({currentTarget:{dataset:{index:0}},detail:{value:'10'}});
  i.calculate();assert.ok(i.data.result);i.savePlan();assert.equal(i.data.plans.length,1);
  i.input(event('rent','50000'));assert.equal(i.data.result,null);
  i.restorePlan({currentTarget:{dataset:{id:i.data.plans[0].id}}});assert.equal(i.data.form.rent,0);
  i.calculate();i.report();const report=env.load('report');report.onLoad();
  assert.equal(report.data.report.title,'投资回报测算报告');assert.ok(report.data.report.terms.length>0);
  assert.equal(env.modals.length,0);delete global.wx;
});
test('旧历史可选，来源快照固定，手动模式可修改金额', () => {
  const env=environment(), s=require('../lib/storage'),o=require('../lib/operating');
  const record={id:'legacy',stationName:'旧站',createdAt:'2026-08-23',form:{...o.sample(false),totalInvestment:2000000,landRent:120000},periodKey:'year'};
  s.write(s.KEYS.history,[record]);const i=env.load('investment');i.onLoad({});i.tab({currentTarget:{dataset:{tab:'saved'}}});i.selectSource({currentTarget:{dataset:{id:'legacy'}}});
  assert.equal(i.data.form.otherInitial,2000000);assert.equal(i.data.form.rent,0);
  const value=i.data.form.annualEbitda;s.write(s.KEYS.history,[]);assert.equal(i.data.form.annualEbitda,value);
  i.manual();i.input(event('annualEbitda','500000'));assert.equal(i.data.source,null);assert.equal(i.data.form.annualEbitda,'500000');delete global.wx;
});
test('个人默认不覆盖销量，编辑输入会使旧结果失效', () => {
  const env=environment(),p=env.load('index');p.onLoad();p.sample();p.saveDefaults();p.input(event('vol92','6666'));p.input(event('opsCost','9999'));p.applyDefaults();
  assert.equal(p.data.form.vol92,'6666');assert.equal(p.data.form.opsCost,8000);
  p.calculate({currentTarget:{dataset:{period:'year'}}});assert.ok(p.data.result);p.input(event('opsCost','1234'));assert.equal(p.data.result,null);delete global.wx;
});
test('年限缩放保留已填修订，超大临时输入不会展开大表', () => {
  const env=environment(),i=env.load('investment');i.onLoad({});i.sample();i.growthInput({currentTarget:{dataset:{index:5}},detail:{value:'-10'}});
  i.input(event('years','3'));i.yearsBlur();assert.equal(i.data.growthRows.length,3);
  i.input(event('years','8'));i.yearsBlur();assert.equal(i.data.growthRows[5].growth,'-10');
  i.choice({currentTarget:{dataset:{key:'mode'}},detail:{value:1}});i.input(event('years','999999999'));assert.equal(i.data.growthRows.length,20);delete global.wx;
});
test('年度箭头每次增减一个百分点，折旧跟随默认年限且保留较短自定义值', () => {
  const env=environment(),i=env.load('investment');i.onLoad({});
  i.growthStep({currentTarget:{dataset:{index:0,step:1}}});assert.equal(i.data.form.growth[0],1);
  i.growthStep({currentTarget:{dataset:{index:0,step:-1}}});assert.equal(i.data.form.growth[0],0);
  i.growthStep({currentTarget:{dataset:{index:0,step:-1}}});assert.equal(i.data.form.growth[0],-1);
  i.assetInput({currentTarget:{dataset:{index:1,key:'life'}},detail:{value:'5'}});
  i.input(event('years','1'));i.input(event('years','15'));i.yearsBlur();
  assert.equal(i.data.form.assets[0].life,15);assert.equal(i.data.form.assets[1].life,5);
  i.input(event('years','3'));i.yearsBlur();assert.ok(i.data.form.assets.every(a=>a.life<=3));
  i.choice(event('repayment','0'));assert.equal(i.data.form.repayment,0);
  i.choice(event('repayment','1'));assert.equal(i.data.form.repayment,1);
  delete global.wx;
});
test('导出逻辑一次生成一张长图，两个品牌图加载后再绘制（模拟微信接口）', async () => {
  const env=environment(),r=env.load('report'),reports=require('../lib/report'),op=require('../lib/operating');
  r.setData({report:reports.operating(op.calculate(op.sample(true)),'长图测试')});
  const draws=[],exports=[];const ctx={font:'',measureText(t){return {width:t.length*Number((this.font.match(/(\d+)px/)||[])[1]||24)};},scale(){},fillRect(){},fillText(t){draws.push(t);},drawImage(img){draws.push(img.src);}};
  const canvas={getContext:()=>ctx,createImage:()=>{const im={};Object.defineProperty(im,'src',{get(){return this.path;},set(v){this.path=v;this.onload();}});return im;}};
  Object.assign(global.wx,{showLoading(){},hideLoading(){},createSelectorQuery:()=>({in(){return this;},select(){return this;},fields(){return this;},exec(cb){cb([{node:canvas}]);}}),canvasToTempFilePath(opts){exports.push(opts);opts.success({tempFilePath:'/tmp/report.png'});}});
  await r.generate();assert.equal(exports.length,1);assert.ok(exports[0].height>1100);assert.equal(r.data.images.length,1);
  assert.ok(draws.includes('/images/miniprogram-profit-icon-512.png'));assert.ok(draws.includes('/images/jyzmt-avatar.jpg'));
  assert.ok(draws.includes('在这里，读懂中国加油站。'));assert.equal(canvas.height,1);assert.equal(r.data.exporting,false);
  delete global.wx;
});
test('简要与完整图片独立生成、预览、保存和分享，失败不覆盖已有图片', async () => {
  const env=environment(),p=env.load('report'),op=require('../lib/operating'),reports=require('../lib/report');
  p.setData({report:reports.operating(op.calculate(op.sample(false)),'两种分享')});
  let count=0, fail=false; const calls=[];
  const ctx={font:'',measureText(t){return {width:t.length*24};},scale(){},fillRect(){},fillText(){},drawImage(){}};
  const canvas={getContext:()=>ctx,createImage:()=>{const im={};Object.defineProperty(im,'src',{set(){im.onload();}});return im;}};
  Object.assign(global.wx,{showLoading(){},hideLoading(){},createSelectorQuery:()=>({in(){return this;},select(){return this;},fields(){return this;},exec(cb){cb([{node:canvas}]);}}),
    canvasToTempFilePath(opts){if(fail)opts.fail({errMsg:'failed'});else opts.success({tempFilePath:'/tmp/share-'+(++count)+'.png'});},
    showShareImageMenu(o){calls.push(['share',o.path]);},saveImageToPhotosAlbum(o){calls.push(['save',o.filePath]);o.success();},previewImage(o){calls.push(['preview',o.current]);assert.equal(o.urls.length,1);assert.equal(o.urls[0],o.current);}});
  const brief={currentTarget:{dataset:{kind:'brief'}}},full={currentTarget:{dataset:{kind:'full'}}};
  await p.generate(brief);const briefPath=p.data.briefImage;
  assert.equal(p.data.images.length,0); await p.generate(full);const fullPath=p.data.images[0];
  assert.notEqual(briefPath,fullPath);assert.equal(p.data.briefImage,briefPath);
  for(const [event,path]of [[brief,briefPath],[full,fullPath]]){
    p.preview(event);p.save(event);p.shareImage(event);
    assert.deepEqual(calls.splice(0),[['preview',path],['save',path],['share',path]]);
  }
  delete global.wx.showShareImageMenu;p.shareImage(brief);assert.deepEqual(calls.pop(),['preview',briefPath]);
  fail=true;await p.generate(brief);assert.equal(p.data.briefImage,briefPath);assert.equal(p.data.images[0],fullPath);assert.equal(p.data.exporting,false);
  p.setData({exporting:true});await p.generate(full);assert.equal(count,2);
  delete global.wx;
});
test('微信编译器实际渲染七个页面，动态表单与事件有效', {skip:!fs.existsSync(compiler)}, () => {
  const env=environment();const names=['home','index','marketing','investment','break-even','report','guide'];
  const compiled=execFileSync(compiler,names.map(n=>'pages/'+n+'/'+n+'.wxml'),{cwd:root,encoding:'utf8'});
  const runtimeErrors=[];const context={window:{},console:{warn:x=>runtimeErrors.push(x),log:x=>runtimeErrors.push(x)}};vm.createContext(context);vm.runInContext(compiled,context);
  function visit(node,fn){if(!node||typeof node!=='object')return;fn(node);(node.children||[]).forEach(n=>visit(n,fn));}
  for(const name of names){const p=env.load(name);if(p.onLoad)p.onLoad({});if(name==='index'){p.sample();p.calculate({currentTarget:{dataset:{period:'year'}}});p.report();}if(name==='marketing'){p.sample();p.calculate();assert.equal(p.data.result.status,'solved');}if(name==='investment'){p.sample();p.calculate();p.report();}
    if(name==='break-even'){p.sample();p.calculateBreakEven();assert.equal(p.data.breakEvenResult.accounting.status,'solved');p.report();}
    const render=context.$gwx('pages/'+name+'/'+name+'.wxml');const tree=render(p.data,{});assert.ok(tree.children.length);
    const inputs=[];visit(tree,n=>{if(n.tag==='wx-input')inputs.push(n);for(const [k,v]of Object.entries(n.attr||{})){if(/^bind/.test(k))assert.equal(typeof p[v],'function',name+': '+v);}});
    if(name==='index'){assert.ok(inputs.length>=18);const volume=inputs.find(n=>n.attr['data-key']==='vol92');assert.equal(volume.attr.value,5000);}
    if(name==='marketing'){assert.ok(inputs.length>=12);assert.ok(inputs.some(n=>n.attr['data-key']==='volume'&&n.attr.value===5000));}
    if(name==='investment'){
      assert.ok(inputs.length>=20);let suffixes=0;
      visit(tree,n=>{if(n.attr&&n.attr.class==='growth-percent')suffixes++;});assert.equal(suffixes,10);
      assert.ok(p.data.form.growth.every(v=>!String(v).includes('%')));
    }
    if(name==='investment'||name==='break-even') for(let mode=0;mode<=4;mode++) {
      p.choice(event('mode',mode)); const alt=render(p.data,{});const radios=[];
      visit(alt,n=>{assert.notEqual(n.tag,'wx-picker');if(n.tag==='wx-radio')radios.push(n);});
      assert.ok(radios.length>=7); if(mode===4)assert.ok(radios.some(n=>n.attr.value===5||n.attr.value==='5'));
    }
    if(name==='investment'||name==='break-even') {
      p.selfOwnedChange({detail:{value:['self-owned']}});
      const own = render(p.data, {}); let checkbox = 0, modeRadios = 0, rentInput = 0;
      visit(own,n=>{if(n.tag==='wx-checkbox'&&n.attr.value==='self-owned'){checkbox++;assert.equal(n.attr.checked,true);}
        if(n.tag==='wx-radio-group'&&n.attr['data-key']==='mode')modeRadios++;
        if(n.tag==='wx-input'&&n.attr['data-key']==='rent')rentInput++;
        for(const [k,v]of Object.entries(n.attr||{}))if(/^bind/.test(k))assert.equal(typeof p[v],'function');});
      assert.equal(checkbox,1);assert.equal(modeRadios,0);assert.equal(rentInput,0);
    }
    if(name==='index'){
      p.switchField(event('hasLng',true));const alt=render(p.data,{});let lng=0;
      visit(alt,n=>{assert.notEqual(n.tag,'wx-picker');if(n.attr&&n.attr['data-key']==='lngCostWeight')lng++;});assert.equal(lng,1);
    }
  }
  assert.equal(runtimeErrors.length,0,JSON.stringify(runtimeErrors));delete global.wx;
});

test('流动资金新方案默认值、修改重算、保存恢复及旧草稿兼容', () => {
  const env=environment(),s=require('../lib/storage'),inv=require('../lib/investment');
  const page=env.load('investment');page.onLoad({});assert.equal(page.data.form.workingCapital,500000);
  page.sample();page.calculate();assert.ok(page.data.result);
  page.input(event('workingCapital','600000'));assert.equal(page.data.result,null);
  page.calculate();page.savePlan();page.input(event('workingCapital','0'));
  page.restorePlan({currentTarget:{dataset:{id:page.data.plans[0].id}}});
  assert.equal(page.data.form.workingCapital,'600000');
  const old={...inv.initialForm(),annualEbitda:100000};delete old.workingCapital;
  s.write(s.KEYS.draft,{form:old});const restored=env.load('investment');restored.onLoad({});
  assert.equal(restored.data.form.workingCapital,0);assert.equal(s.read(s.KEYS.draft).form.workingCapital,undefined);
  s.write(s.KEYS.plans,[{id:'old',form:old}]);restored.restorePlan({currentTarget:{dataset:{id:'old'}}});
  assert.equal(restored.data.form.workingCapital,0);delete global.wx;
});

test('取消双方出资输入，旧草稿和方案明确选择新模式后才可计算', () => {
  const env=environment(),s=require('../lib/storage'),inv=require('../lib/investment');
  const old={...inv.initialForm(),annualEbitda:100000,mode:3,cooperation:0,ownContribution:200000};
  s.write(s.KEYS.draft,{form:old});s.write(s.KEYS.plans,[{id:'joint-old',form:old}]);
  const i=env.load('investment');i.onLoad({});assert.equal(i.data.legacyJointMode,true);
  i.calculate();assert.equal(i.data.result,null);assert.match(env.modals.at(-1).content,/已取消/);
  i.choice(event('mode','2'));assert.equal(i.data.legacyJointMode,false);i.calculate();assert.ok(i.data.result);assert.equal(i.data.result.ownShare,1);
  assert.equal(s.list(s.KEYS.plans)[0].form.cooperation,0);
  i.restorePlan({currentTarget:{dataset:{id:'joint-old'}}});assert.equal(i.data.legacyJointMode,true);
  i.choice(event('mode','3'));assert.equal(i.data.form.cooperation,1);assert.equal(i.data.legacyJointMode,false);i.calculate();assert.ok(i.data.result);
  const missing={...old};delete missing.cooperation;s.write(s.KEYS.draft,{form:missing});const j=env.load('investment');j.onLoad({});assert.equal(j.data.legacyJointMode,true);
  const wxml=fs.readFileSync(path.join(root,'pages/investment/investment.wxml'),'utf8');
  assert.ok(!wxml.includes('data-key="ownContribution"'));assert.ok(!wxml.includes('data-key="cooperation"'));
  assert.match(wxml,/业主动态租金比例/);delete global.wx;
});

test('年度修正独立单份覆盖保存，默认归零，显式应用按年限补零', () => {
  const env=environment(),s=require('../lib/storage');const p=env.load('investment');p.onLoad({});
  assert.ok(p.data.form.growth.every(v=>v===0));p.input(event('years','3'));p.yearsBlur();
  p.growthInput({currentTarget:{dataset:{index:0}},detail:{value:'10'}});p.saveGrowthSettings();
  p.growthInput({currentTarget:{dataset:{index:0}},detail:{value:'-5'}});p.saveGrowthSettings();
  assert.deepEqual(s.read(s.KEYS.growthSettings).growth,[-5,0,0]);
  const fresh=env.load('investment');fresh.onLoad({});assert.equal(fresh.data.hasGrowthSettings,true);
  assert.ok(fresh.data.form.growth.every(v=>v===0));fresh.applyGrowthSettings();
  assert.deepEqual(fresh.data.form.growth,[-5,0,0,0,0,0,0,0,0,0]);assert.equal(fresh.data.form.workingCapital,500000);
  fresh.resetGrowth();assert.ok(fresh.data.form.growth.every(v=>v===0));assert.equal(s.read(s.KEYS.growthSettings).growth[0],-5);
  fresh.growthInput({currentTarget:{dataset:{index:0}},detail:{value:'-101'}});fresh.saveGrowthSettings();
  assert.equal(s.read(s.KEYS.growthSettings).growth[0],-5);assert.match(env.modals.at(-1).content,/修正比例/);delete global.wx;
});
test('独立销量页面可直接计算，草稿恢复且不改投资或利润数据', () => {
  const env=environment(),s=require('../lib/storage'),inv=require('../lib/investment');
  s.write(s.KEYS.draft,{form:{...inv.initialForm(),rent:77777},source:{id:'source'}});
  s.write(s.KEYS.recent,[{id:'recent'}]);const original=structuredClone([...env.stored]);
  const p=env.load('break-even');p.onLoad({});assert.equal(p.data.form.rent,0);
  p.input(event('rent','100000'));p.calculateBreakEven();assert.ok(p.data.breakEvenResult);assert.equal(p.data.form.annualEbitda,'');
  p.breakEvenInput({currentTarget:{dataset:{index:0,key:'margin'}},detail:{value:'1.5'}});assert.equal(p.data.breakEvenResult,null);
  p.calculateBreakEven();p.input(event('discountRate','8'));assert.equal(p.data.breakEvenResult,null);
  p.calculateBreakEven();p.onHide();const restored=env.load('break-even');restored.onLoad({});
  assert.equal(restored.data.breakEvenInputs[0].margin,'1.5');assert.equal(restored.data.form.rent,'100000');
  for(const [key,value] of original)assert.deepEqual(s.read(key),value);
  assert.equal(restored.onShareAppMessage().path,'/pages/break-even/break-even');
  assert.equal(env.modals.length,0);delete global.wx;
});
test('原内嵌倒推草稿只迁移一次，后续投资编辑不覆盖独立草稿', () => {
  const env=environment(),s=require('../lib/storage'),inv=require('../lib/investment'),be=require('../lib/break-even');
  const old={form:{...inv.initialForm(),rent:12345},breakEvenInputs:be.initialInputs(),source:{id:'old'}};
  old.breakEvenInputs[0].margin=1.8;s.write(s.KEYS.draft,old);
  const investment=env.load('investment');investment.onLoad({});
  assert.equal(s.read(s.KEYS.breakEvenDraft).form.rent,12345);assert.deepEqual(s.read(s.KEYS.draft),old);
  investment.input(event('rent','99999'));investment.onHide();
  const p=env.load('break-even');p.onLoad({});assert.equal(p.data.form.rent,12345);assert.equal(p.data.breakEvenInputs[0].margin,1.8);
  p.input(event('rent','67890'));p.onHide();storageCheck();
  function storageCheck(){const again=env.load('investment');again.onLoad({});assert.equal(s.read(s.KEYS.breakEvenDraft).form.rent,'67890');assert.equal(again.data.form.rent,'99999');}
  assert.equal(env.modals.length,0);delete global.wx;
});
test('首页四入口注册有效，投资页面已移除倒推表单', () => {
  const env=environment(),home=env.load('home');const app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));
  for(const page of ['index/index','investment/investment','break-even/break-even','marketing/marketing']) {
    home.open({currentTarget:{dataset:{page}}});assert.equal(env.calls.at(-1).url,'/pages/'+page);assert.ok(app.pages.includes('pages/'+page));
  }
  const html=fs.readFileSync(path.join(root,'pages/home/home.wxml'),'utf8');assert.equal((html.match(/class="entry"/g)||[]).length,4);
  const positions=['index/index','investment/investment','break-even/break-even','marketing/marketing'].map(page=>html.indexOf('data-page="'+page+'"'));
  assert.ok(positions.every((p,i)=>p>=0 && (!i || p>positions[i-1])));
  assert.match(html,/04 \/ 营销活动/); assert.equal(home.data.version,'3.0.0');
  assert.deepEqual(app.pages.slice(1,5),positions.map((_,i)=>'pages/'+['index/index','investment/investment','break-even/break-even','marketing/marketing'][i]));
  assert.ok(!fs.readFileSync(path.join(root,'pages/investment/investment.wxml'),'utf8').includes('break-even'));
  const p=env.load('investment');assert.equal(p.calculateBreakEven,undefined);delete global.wx;
});
test('两页面共享唯一年度修正设置，显式填入才修改当前表单', () => {
  const env=environment(),i=env.load('investment'),p=env.load('break-even');i.onLoad({});p.onLoad({});
  i.growthInput({currentTarget:{dataset:{index:0}},detail:{value:'8'}});i.saveGrowthSettings();
  p.onShow();assert.equal(p.data.hasGrowthSettings,true);assert.equal(p.data.form.growth[0],0);p.applyGrowthSettings();assert.equal(p.data.form.growth[0],8);
  p.growthInput({currentTarget:{dataset:{index:0}},detail:{value:'-5'}});p.saveGrowthSettings();assert.equal(i.data.form.growth[0],'8');
  i.applyGrowthSettings();assert.equal(i.data.form.growth[0],-5);delete global.wx;
});

test('盈亏平衡计算到报告及两种图片分享完整路径，修改后不分享旧结果', async () => {
  const env=environment(),s=require('../lib/storage'),p=env.load('break-even');p.onLoad();p.sample();p.nameInput(event('', '城南站'));
  p.calculateBreakEven();p.report();assert.equal(env.calls.at(-1).url,'/pages/report/report');
  const r=env.load('report');r.onLoad();assert.equal(r.data.report.type,'break-even');assert.equal(r.data.report.name,'城南站');assert.match(r.data.report.notes.join(''),/365/);
  const texts=[],shares=[],saves=[];let n=0;
  const ctx={font:'',measureText(t){return {width:t.length*20};},scale(){},fillRect(){},fillText(t){texts.push(t);},drawImage(){}};
  const canvas={getContext:()=>ctx,createImage:()=>{const image={};Object.defineProperty(image,'src',{set(){image.onload();}});return image;}};
  Object.assign(global.wx,{showLoading(){},hideLoading(){},createSelectorQuery:()=>({in(){return this;},select(){return this;},fields(){return this;},exec(cb){cb([{node:canvas}]);}}),canvasToTempFilePath(o){o.success({tempFilePath:'/tmp/break-even-'+(++n)+'.png'});},showShareImageMenu(o){shares.push(o.path);},saveImageToPhotosAlbum(o){saves.push(o.filePath);o.success();},previewImage(){}});
  for(const kind of ['brief','full']){const e={currentTarget:{dataset:{kind}}};await r.generate(e);r.shareImage(e);r.save(e);}
  assert.equal(n,2);assert.deepEqual(shares,saves);assert.notEqual(shares[0],shares[1]);assert.ok(texts.some(t=>t.includes('盈亏平衡销量')));assert.equal(r.data.exporting,false);
  const saved=structuredClone(s.read(s.KEYS.report));const calls=env.calls.length;p.input(event('rent','900000'));assert.equal(p.data.breakEvenResult,null);p.report();assert.equal(env.calls.length,calls);assert.deepEqual(s.read(s.KEYS.report),saved);
  assert.equal(env.modals.length,0);delete global.wx;
});
