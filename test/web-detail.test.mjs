// The visible result state must distinguish a pending/failed read from an
// authoritative response that really contains no written result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/web/app.js',import.meta.url),'utf8');
const functionBody=(name,next)=>source.slice(source.indexOf(`function ${name}(`),source.indexOf(`function ${next}(`));
const el=(tag,attrs,children=[])=>({tag,attrs,children});

test('result loading and read failure have explicit states and an actionable retry',()=>{
 const state={detailErrors:new Map(),remote:false,macOnline:true};let retry;
 const render=vm.runInNewContext(functionBody('renderDetailPending','renderResult')+'\nrenderDetailPending',{state,el,ensureDetail:id=>{retry=id;}});
 const pending=render(4);assert.equal(pending.children[0].attrs.text,'Loading result…');
 assert.equal(pending.children.length,1);
 state.detailErrors.set(4,'Host is unreachable');
 const failed=render(4);assert.equal(failed.children[0].attrs.text,'Could not load this result.');
 assert.equal(failed.children[1].attrs.text,'Host is unreachable');
 failed.children[2].attrs.onClick();assert.equal(retry,4);
 state.remote=true;state.macOnline=false;
 assert.equal(render(4).children[2].attrs.disabled,true);
});

test('detail read errors remain visible until retry and a successful retry saves authoritative content',async()=>{
 const state={details:new Map(),detailErrors:new Map()};let fail=true;let renders=0;
 const start=source.indexOf('async function ensureDetail(');
 const end=source.indexOf('// --- keyboard',start);
 const ensure=vm.runInNewContext(source.slice(start,end)+'\nensureDetail',{state,render:()=>{renders++;},api:async()=>{if(fail)throw Error('Network request failed');return {id:4,result:'Saved result'};}});
 await ensure(4);assert.equal(state.details.has(4),false);assert.equal(state.detailErrors.get(4),'Network request failed');
 fail=false;await ensure(4);assert.equal(state.detailErrors.has(4),false);assert.equal(state.details.get(4).result,'Saved result');assert.equal(renders,3);
});

test('live rendering keeps the composer attached while replacing surrounding content',()=>{
 const parent={childNodes:[],insertBefore(child,before){if(child.parent===this)throw Error('retained child was moved');const i=before?this.childNodes.indexOf(before):this.childNodes.length;this.childNodes.splice(i,0,child);child.parent=this;}};
 const child=name=>({name,parent:null,remove(){const i=this.parent.childNodes.indexOf(this);this.parent.childNodes.splice(i,1);this.parent=null;}});
 const oldHeader=child('old header'),composer=child('composer');parent.childNodes=[oldHeader,composer];oldHeader.parent=composer.parent=parent;
 const replace=vm.runInNewContext(functionBody('replaceChildrenKeepingConnected','keepFocus')+'\nreplaceChildrenKeepingConnected',{});
 const header=child('header'),rows=child('rows');replace(parent,[header,rows,composer]);
 assert.deepEqual(parent.childNodes.map(n=>n.name),['header','rows','composer']);assert.equal(composer.parent,parent);
});

test('a reconstructed draft keeps its selection and scroll without focusing inert controls',()=>{
 const old={getAttribute:()=> 'decision-draft-4',selectionStart:3,selectionEnd:9,selectionDirection:'forward',scrollTop:80,scrollLeft:0};
 let selection,focused=0,inert=false;
 const next={disabled:false,closest:()=>inert,focus(options){assert.equal(options.preventScroll,true);focused++;},setSelectionRange(...range){selection=range;}};
 const document={activeElement:old,querySelector:()=>next};
 const keep=vm.runInNewContext(functionBody('keepFocus','render')+'\nkeepFocus',{document});
 keep()();assert.equal(focused,1);assert.deepEqual(selection,[3,9,'forward']);assert.equal(next.scrollTop,80);
 inert=true;keep()();assert.equal(focused,1);
});

test('workspace startup and connection failure never impersonate an empty task list',async()=>{
 const state={loadError:null};let loads=0;
 const render=vm.runInNewContext(functionBody('renderWorkspaceStatus','renderResult')+'\nrenderWorkspaceStatus',{state,el,render:()=>{},loadAll:async()=>{loads++;}});
 assert.equal(render().children[0].attrs.text,'Loading tasks…');
 state.loadError='Connection failed';const failed=render();assert.equal(failed.children[0].attrs.text,'Could not load tasks');
 await failed.children[2].attrs.onClick();assert.equal(loads,1);assert.equal(state.loadError,null);
});

test('mobile live updates keep the detail scroller and visible sticky strip connected',()=>{
 class Node {
  constructor(attrs={}) {this.attrs=attrs;this.className=attrs.class??'';this.childNodes=[];this.parent=null;this.scrollTop=170;this.classList={contains:name=>this.className.split(' ').includes(name)};}
  insertBefore(node,before) {assert.equal(node.parent,null,'connected node must not be reinserted');const i=before?this.childNodes.indexOf(before):this.childNodes.length;this.childNodes.splice(i,0,node);node.parent=this;}
  remove() {this.parent.childNodes.splice(this.parent.childNodes.indexOf(this),1);this.parent=null;}
  querySelector(selector) {const name=selector.slice(1);for(const node of this.childNodes){if(node.className.split(' ').includes(name))return node;const found=node.querySelector(selector);if(found)return found;}return null;}
 }
 const el=(tag,attrs={},children=[])=>{const node=new Node(attrs);for(const child of children)node.insertBefore(child,null);return node;};
 const replace=vm.runInNewContext(functionBody('replaceChildrenKeepingConnected','keepFocus')+'\nreplaceChildrenKeepingConnected',{});
 let mounted=null,revision=0;
 const render=vm.runInNewContext(functionBody('renderMobileDetail','renderMobile')+'\nrenderMobileDetail',{
  mobile:{detailId:4},mobileDetailMounted:null,state:{details:new Map()},
  document:{querySelector:()=>mounted},el,replaceChildrenKeepingConnected:replace,
  renderMobileDetailContent:()=>[el('h1',{class:'m-dtitle',text:'Revision '+revision})],
  renderMobileOfflineBar:()=>null,renderMobileDetailToolbar:()=>el('nav'),renderMobileActionBar:()=>el('footer'),renderMobileCorrectionSheet:()=>null
 });
 const ledger={rows:[{id:4,title:'Saved result',stateLabel:'READY'}]};
 mounted=render(ledger,'blue',false);
 const scroller=mounted.querySelector('.m-dcontent'),sticky=scroller.querySelector('.m-sticky');
 sticky.className+=' shown';revision++;
 assert.equal(render(ledger,'blue',false),mounted);
 assert.equal(mounted.querySelector('.m-dcontent'),scroller);
 assert.equal(scroller.scrollTop,170);
 assert.equal(scroller.querySelector('.m-sticky'),sticky);
 assert.ok(sticky.classList.contains('shown'));
 assert.equal(scroller.querySelector('.m-dtitle').attrs.text,'Revision 1');
});

test('one passive scroll listener reads the current title after a live update',()=>{
 let bottom=20,handler,registrations=0,shown;
 const sticky={classList:{toggle:(name,value)=>{shown=value;}}};
 const scroller={querySelector:selector=>selector==='.m-sticky'?sticky:{getBoundingClientRect:()=>({bottom})},getBoundingClientRect:()=>({top:0}),addEventListener:(name,fn,options)=>{assert.equal(name,'scroll');assert.equal(options.passive,true);handler=fn;registrations++;}};
 const wire=vm.runInNewContext(functionBody('wireMobileStickyDetail','onViewportResize')+'\nwireMobileStickyDetail',{mobileStickyScrollers:new WeakSet()});
 wire(scroller);assert.equal(shown,false);
 bottom=-5;wire(scroller);assert.equal(shown,true);assert.equal(registrations,1);
 bottom=20;handler();assert.equal(shown,false);
});

test('Safari address-bar and keyboard height changes do not rebuild the reader',()=>{
 const start=source.indexOf('function onViewportResize('),end=source.indexOf('// Back is an edge swipe',start);
 const state={width:390},window={innerWidth:390};let renders=0;
 const resize=vm.runInNewContext(source.slice(start,end)+'\nonViewportResize',{state,window,render:()=>{renders++;}});
 resize();resize();assert.equal(renders,0);
 window.innerWidth=844;resize();assert.equal(renders,1);assert.equal(state.width,844);
});
