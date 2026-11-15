// Execute the production renderers in a small DOM harness. No browser-only
// transport is started; assertions concern the visible offline action contract.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../src/web/app.js", import.meta.url), "utf8");
function renderer(name, next, dependencies) {
  const body = source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
  return vm.runInNewContext(`${body}\n${name}`, dependencies);
}

test("mobile offline detail contains its own visible banner above the toolbar", () => {
  const banner = {kind:"offline"};
  const toolbar = {kind:"toolbar"};
  const render = renderer("renderMobileDetail", "renderMobile", {
    mobile:{detailId:1}, mobileDetailMounted:null, state:{details:new Map()},
    document:{querySelector:()=>null},
    replaceChildrenKeepingConnected:(node,children)=>{node.children=children.filter(Boolean);},
    renderMobileDetailContent:()=>[], renderMobileOfflineBar:()=>banner,
    renderMobileDetailToolbar:()=>toolbar, renderMobileActionBar:()=>({kind:"actions"}),
    renderMobileCorrectionSheet:()=>null,
    el:(tag,attrs,children=[])=>({tag,attrs,children})
  });
  const detail = render({rows:[{id:1,title:"Task",stateLabel:"READY"}]}, "blue", true);
  assert.equal(detail.children[0],banner,"banner must live inside the detail stacking context");
  assert.equal(detail.children[1],toolbar);
});

test("mobile offline bars disable every mutation; online permissions keep their own restrictions", () => {
  let buttons;
  const render = renderer("renderMobileActionBar", "buildMobileActionBar", {
    buildMobileActionBar:()=>({querySelectorAll:()=>buttons})
  });
  for (const status of ["working","needs_you","ready","failed","done"]) {
    buttons=[{disabled:false},{disabled:true}];
    render({status},true);
    assert.ok(buttons.every(b=>b.disabled),status);
  }
  buttons=[{disabled:false},{disabled:true}];
  render({status:"needs_you"},false);
  assert.equal(buttons[0].disabled,false);
  assert.equal(buttons[1].disabled,true,"online rendering must not re-enable a forbidden permission");
});

test("editing a decision draft offline cannot re-enable its mutation buttons", () => {
  const state={remote:true,macOnline:false,providers:[],answers:new Map()};
  const buttons=[{disabled:true},{disabled:true}];
  let textarea;
  const render=renderer("renderMobileDecisionContent","renderNextHarness",{
    state,document:{querySelectorAll:()=>buttons},
    el:(tag,attrs,children=[])=>{
      const node={tag,attrs,children,addEventListener(type,handler){this[type]=handler;}};
      if(tag==='textarea')textarea=node;
      return node;
    }
  });
  render({id:1});textarea.value='Saved offline draft';textarea.input();
  assert.ok(buttons.every(b=>b.disabled));
  assert.equal(state.answers.get(1),'Saved offline draft');
  state.macOnline=true;textarea.input();
  assert.ok(buttons.every(b=>!b.disabled));
});
