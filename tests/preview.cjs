// Offline QA only: render official-compiler WXML trees in a browser. Not an H5 product.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http');
const { createRequire } = require('node:module'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const names=['home','index','investment','break-even','report','guide'];
const compiler=['/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec/wcc','/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc'].find(fs.existsSync);
const compiled=execFileSync(compiler,names.map(n=>'pages/'+n+'/'+n+'.wxml'),{cwd:root,encoding:'utf8'});
const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(compiled,ctx);
const be=require('../lib/break-even'), o=require('../lib/operating'), invest=require('../lib/investment'),reports=require('../lib/report');
const f=invest.initialForm();f.name='城南站 · 年付租赁方案';f.annualEbitda=1000000;f.assets[0].amount=2000000;f.assets[1].amount=1000000;f.rent=200000;f.loanAmount=1000000;
f.mode=4;
const investment=invest.calculate(f);const report=reports.investment(investment);
const dataMap=new Map();
global.wx={getStorageSync:k=>dataMap.get(k)||'',setStorageSync:(k,v)=>dataMap.set(k,v),showShareMenu(){},showModal(){},showToast(){},pageScrollTo(){},navigateTo(){}};
function pageData(name,kind) {
 const file=path.join(root,'pages',name,name+'.js');let p;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),wx:global.wx,Page:x=>{p=x},console});
 p.data=structuredClone(p.data);p.setData=function(change,cb){for(const[k,v]of Object.entries(change)){const parts=k.replace(/\[(\d+)\]/g,'.$1').split('.');let x=this.data;while(parts.length>1)x=x[parts.shift()];x[parts[0]]=v;}if(cb)cb();};
 if(p.onLoad)p.onLoad({});
 if(name==='index'){p.sample();p.nameInput({detail:{value:'城南站'}});p.calculate({currentTarget:{dataset:{period:'year'}}});p.saveHistory();}
 if(name==='investment'){p.setData({form:f});p.refreshGrowth();p.refreshFunding();p.calculate();}
 if(name==='break-even'){p.setData({form:f});p.refreshFunding();p.calculateBreakEven();}
 if(name==='report')p.data.report=kind==='break-even'?reports.breakEven(be.calculate(f,be.initialInputs())):kind==='operating'?reports.operating(o.calculate(o.sample(true)),'城南站'):report;
 return p.data;
}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function html(node){
 if(node===null||node===undefined)return '';if(typeof node!=='object')return escape(node);
 const kind=(node.tag||'virtual').replace('wx-',''),a=node.attr||{};
 if(kind==='virtual'||kind==='page')return(node.children||[]).map(html).join('');
 const tags={view:'div',text:'span',image:'img',input:'input',button:'button',picker:'div','scroll-view':'div',switch:'input',radio:'input','radio-group':'div',label:'label',canvas:'canvas',swiper:'div','swiper-item':'div'};
 const tag=tags[kind]||'div';const attr={};
 for(const k of ['id','class','value','placeholder','disabled'])if(a[k]!==undefined&&a[k]!==false)attr[k]=a[k];
 if(kind==='image')attr.src='/asset'+a.src;
 if(kind==='scroll-view')attr.style='overflow:auto';
 if(kind==='switch'){attr.type='checkbox';if(a.checked)attr.checked='checked';}
 else if(kind==='radio'){attr.type='radio';attr.style='width:18px;height:18px;min-width:18px;flex:0 0 18px;padding:0;margin:0;background:none;border:0';if(a.checked)attr.checked='checked';}
 else if(kind==='input')attr.type='text';
 return '<'+tag+Object.entries(attr).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+(['input','img'].includes(tag)?'':(node.children||[]).map(html).join('')+'</'+tag+'>');
}
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/asset/images/')){const file=path.join(root,'images',path.basename(url.pathname));if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(file));return;}
 if(url.pathname==='/images'){
  const file=path.resolve(root,'../output/reports-v2/投资报告.png');
  if(!fs.existsSync(file)){res.writeHead(404);res.end('Run tests/render-reports.cjs first');return;}
  res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(file));return;
 }
 const name=names.includes(url.searchParams.get('page'))?url.searchParams.get('page'):'home';
 const css=(fs.readFileSync(path.join(root,'app.wxss'),'utf8')+fs.readFileSync(path.join(root,'pages',name,name+'.wxss'),'utf8').replace(/@import \"([^\"]+)\";/g,(_,file)=>fs.readFileSync(path.resolve(root,'pages',name,file),'utf8'))).replace(/^page\s*\{/,'body{').replace(/(?<![\w.-])image(?=[\s{,.:])/g,'img').replace(/(?<![\w.-])view(?=[\s{,.:])/g,'div').replace(/(?<![\w.-])text(?=[\s{,.:])/g,'span').replace(/(-?[\d.]+)rpx/g,(_,n)=>'calc('+n+' * 100vw / 750)');
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>2.0 离线排版检查</title><style>body{margin:0}button,input{font-family:inherit}button{border:0}input{min-width:0;box-sizing:border-box}'+css+'</style><body>'+html(ctx.$gwx('pages/'+name+'/'+name+'.wxml')(pageData(name,url.searchParams.get('kind')),{}))+'</body></html>');
}).listen(Number(process.env.OIL_QA_PORT)||8767,'127.0.0.1',()=>console.log('Offline QA preview: http://127.0.0.1:'+(process.env.OIL_QA_PORT||8767)));
