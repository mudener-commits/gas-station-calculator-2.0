// Offline image QA: uses the exact production layout and painter, no browser mocks.
const fs = require('node:fs'), path = require('node:path');
const {createCanvas,loadImage,GlobalFonts} = require('@napi-rs/canvas');
// The offline renderer does not inherit WeChat's CJK font fallback.
GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','sans-serif');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Songti.ttc','Songti SC');
const op = require('../lib/operating'), inv = require('../lib/investment'), reports = require('../lib/report');
const {layout,dimensions,paint}=require('../lib/report-layout');
const be=require('../lib/break-even');
const brand=require('../lib/brand');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/reports-v2');
async function main(){
  fs.mkdirSync(out,{recursive:true});const logos={};
  for(const src of [brand.appLogo,brand.accountLogo])logos[src]=await loadImage(path.join(root,src));
  const f=inv.initialForm();Object.assign(f,{name:'示例油站 · 10 年租赁 / 2 年一付',annualEbitda:1000000,mode:4,rent:200000,loanAmount:1000000});
  f.assets[0].amount=2000000;f.assets[1].amount=1000000;f.growth[0]=10;f.growth[1]=8;f.growth[2]=-10;
  const cases=[['经营报告',reports.operating(op.calculate(op.sample(true)),'示例油站')],['投资报告',reports.investment(inv.calculate(f))]];
  f.years=20;f.growth=Array(20).fill(0);f.name='20 年边界验证';cases.push(['投资报告20年',reports.investment(inv.calculate(f))]);
  cases.push(['经营简要版', reports.brief(cases[0][1])], ['投资简要版', reports.brief(cases[1][1])]);
  const owner=inv.initialForm();Object.assign(owner,{name:'示例油站 · 动态租金',annualEbitda:1000000,mode:2,loanAmount:800000});
  owner.assets[0].amount=1200000;owner.assets[1].amount=800000;
  const ownerReport=reports.investment(inv.calculate(owner));
  cases.push(['动态租金报告',ownerReport],['动态租金简要版',reports.brief(ownerReport)]);
  const threshold=inv.initialForm();Object.assign(threshold,{name:'城南站 · 盈亏平衡销量',mode:4,rent:200000,loanAmount:1000000});
  threshold.assets[0].amount=2000000;threshold.assets[1].amount=1000000;
  const inputs=be.initialInputs();inputs[0].ratio=40;inputs[3].ratio=10;
  const thresholdReport=reports.breakEven(be.calculate(threshold,inputs));
  cases.push(['盈亏平衡销量报告',thresholdReport],['盈亏平衡销量简要版',reports.brief(thresholdReport)]);
  for(const[name,report]of cases){
    const c=createCanvas(750,100),ctx=c.getContext('2d');
    const plan=layout(report,(t,s,b,family='sans-serif')=>{ctx.font=(b?'bold ':'')+s+'px '+family;return ctx.measureText(t).width;});
    const d=dimensions(plan);c.width=d.width;c.height=d.height;paint(c.getContext('2d'),plan,logos,d.scale);
    fs.writeFileSync(path.join(out,name+'.png'),c.toBuffer('image/png'));
    // Separate inspection views, not additional report pages.
    const tableTitle=plan.items.find(x=>x.kind==='text'&&x.text==='逐年利润与现金流');
    const inspections=[['页首',0],['页尾',Math.max(0,d.height-1200)]];
    if(tableTitle)inspections.push(['年度表',Math.max(0,Math.floor(tableTitle.y*d.scale)-20)]);
    for(const[part,top]of inspections){
      const detail=createCanvas(d.width,1200);detail.getContext('2d').drawImage(c,0,top,d.width,1200,0,0,d.width,1200);
      fs.writeFileSync(path.join(out,name+'-'+part+'.png'),detail.toBuffer('image/png'));
    }
    console.log(name+': '+d.width+'×'+d.height+'; 原始高度 '+plan.height);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
