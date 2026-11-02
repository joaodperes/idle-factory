import {loadCatalog} from './core/catalog.js';
import {SAVE_KEY,loadLocal,sanitizeSave,serializeSave,defaultState} from './core/state.js';
import {fmt,timeLabel} from './core/format.js';
import {simulate,gridStatus,price,marketQuantity,completeContract,contractAvailable,managerLevel,availableTalentPoints,prestigeGain,companyValue,capacity,sell,marketActivity} from './core/engine.js';
import {usedSlots,totalSlots,upgradeCost,nodeCost,moveFacility} from './core/graph.js';
import {addFacility,removeFacility,addEdge,upgradeFacility,buyResearch,buyTalent,buyInvestment,resetCompany,saveLayout,loadLayout,setSpecialization} from './core/actions.js';
import {TUTORIAL_STEPS,advanceTutorial,tutorialPort} from './core/tutorial.js';

const catalog=await loadCatalog();
const loaded=loadLocal(catalog);
let state=loaded.state;
let activeTab='factory';
let pending=null;
let drag=null;
let notifyTimer=null;
let practiceSnapshot=null; // Replays run in a disposable practice factory; player saves are untouched.
const CANVAS_W=2500,CANVAS_H=1650,MIN_CANVAS_ZOOM=0.35,MAX_CANVAS_ZOOM=1.75;
let canvasZoom=1; // Canvas-only zoom, never browser/page zoom.
const inTutorial=()=>!state.onboarding;
const $=selector=>document.querySelector(selector);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nodeDef=n=>catalog.facilities[n.kind];
const money=n=>`${fmt(n)} cr`;
const byId=id=>state.nodes.find(n=>n.id===id);
const alertToast=(message,bad=false)=>{const t=$('#toast');t.textContent=message;t.classList.toggle('error',bad);t.classList.add('visible');clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>t.classList.remove('visible'),3000);};
const runAction=(error,success)=>{if(error)alertToast(error,true);else{if(success)alertToast(success);advanceTutorial(state);refresh();saveLocal();}};
function saveLocal(){
  if(practiceSnapshot)return true;
  try{localStorage.setItem(SAVE_KEY,serializeSave(state));$('#save-status').textContent=`Saved locally at ${new Date().toLocaleTimeString()}`;return true;}
  catch(err){alertToast('Local save failed. Download a JSON backup.',true);return false;}
}
function setTab(tab){
  if(inTutorial()&&tab!=='factory')return;
  activeTab=tab;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${tab}`));
  refresh();
}
function renderMetrics(){
  const g=gridStatus(state,catalog);
  const values=inTutorial()? [['CREDITS',money(state.credits)],['REVENUE',money(state.runRevenue)],['POWER',`${fmt(g.supply)} / ${fmt(g.demand)}`]] : [['CREDITS',money(state.credits)],['REVENUE',money(state.runRevenue)],['RESEARCH',fmt(state.data)],['POWER',`${fmt(g.supply)} / ${fmt(g.demand)}`],['CAPACITY',`${usedSlots(state,catalog)} / ${totalSlots(state)}`],['ANGELS',fmt(state.angels)]];
  $('#metrics').innerHTML=values.map(([name,value])=>`<div class="metric"><small>${name}</small><strong>${value}</strong></div>`).join('');
}
function renderFacilities(){
  const step=TUTORIAL_STEPS[state.tutorialStep||0];
  const list=Object.entries(catalog.facilities).filter(([kind])=>!inTutorial() || kind===step?.build).map(([kind,def])=>{
    const unlocked=state.runRevenue>=def.unlock;
    const cost=nodeCost(kind,state,catalog);
    const allowed=unlocked&&state.credits>=cost&&usedSlots(state,catalog)+def.slots<=totalSlots(state);
    return `<div class="build-item ${!unlocked?'locked':''} ${inTutorial()&&kind===step?.build?'tutorial-highlight':''}"><span class="build-icon" style="--accent:${def.color}">${def.icon}</span><div class="build-copy"><strong>${safe(def.name)}</strong><small>${unlocked?`${def.slots} slots · ${money(cost)}`:`Unlock ${money(def.unlock)} revenue`}</small></div><button data-action="build" data-kind="${kind}" ${allowed?'':'disabled'} title="${safe(def.description)}">＋</button></div>`;
  }).join('');
  $('#facility-list').innerHTML=list;
}
function nodeMarkup(node){
  const def=nodeDef(node),isMarket=node.kind==='market';
  const materialIn=isMarket?['any']:Object.keys(def.inputs||{});
  const powerIn=def.demand>0;
  const out=def.output&&def.output!=='data'?def.output:null;
  const port=(kind,resource,label)=>`<button class="port ${kind} ${resource==='power'?'power':'matter'}" data-port="${kind}" data-resource="${resource}" data-node="${node.id}" style="--port-color:${catalog.resources[resource]?.color||'#449eaa'}" title="${safe(label)}" aria-label="${safe(label)}"></button>`;
  return `<div class="factory-node ${node.id===state.selectedNode?'selected':''} ${node.enabled?'':'disabled-node'}" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px;--node-color:${def.color}">
    <div class="node-head" data-drag="${node.id}"><span class="node-icon">${def.icon}</span><span><strong>${safe(def.name)}</strong><small>UNIT ${node.id.toUpperCase()} · LV ${node.level}</small></span></div>
    <div class="node-body"><div class="node-throughput" data-node-rate="${node.id}">Calculating…</div><div class="node-buffer" data-node-stock="${node.id}">0 stored</div></div>
    <div class="port-set left">${materialIn.map(r=>port('in',r,r==='any'?'Accept any product':`Input: ${r}`)).join('')}${powerIn?port('in','power','Power input'):''}</div>
    <div class="port-set right">${out?port('out',out,`Output: ${out}`):''}${isMarket?'':port('out','power','Power network output')}</div>
    <button class="node-select" data-action="select" data-id="${node.id}" aria-label="Inspect ${safe(def.name)}">Inspect ↗</button>
  </div>`;
}
/** Read actual port centers, not guessed node offsets. Works with any port count, node size and zoom/scroll. */
function portCenter(nodeId,side,resource){
  const node=document.querySelector(`[data-node-id="${nodeId}"]`);
  if(!node)return null;
  const port=[...node.querySelectorAll('.port')].find(p=>p.dataset.port===side && (p.dataset.resource===resource||(side==='in'&&p.dataset.resource==='any'&&resource!=='power')));
  if(!port)return null;
  const rect=port.getBoundingClientRect(),origin=$('#editor-world').getBoundingClientRect();
  return {x:(rect.left+rect.width/2-origin.left)/canvasZoom,y:(rect.top+rect.height/2-origin.top)/canvasZoom};
}
function drawLinks(){
  const svg=$('#links');
  const curves=state.edges.map(edge=>{
    const from=byId(edge.from),to=byId(edge.to);if(!from||!to)return '';
    const a=portCenter(from.id,'out',edge.resource),b=portCenter(to.id,'in',edge.resource);
    if(!a||!b)return '';
    const dx=Math.max(55,Math.abs(b.x-a.x)*0.42);
    const d=`M${a.x},${a.y} C${a.x+dx},${a.y} ${b.x-dx},${b.y} ${b.x},${b.y}`;
    const color=edge.resource==='power'?'#f2db3d':(catalog.resources[edge.resource]?.color||'#63b9b7');
    return `<path d="${d}" class="edge-back"/><path d="${d}" stroke="${color}" stroke-width="${edge.resource==='power'?3.4:2.8}" ${edge.resource==='power'?'stroke-dasharray="9 6"':''} fill="none" stroke-linecap="round"/><path d="${d}" class="edge-hit" data-edge="${edge.id}" aria-label="Remove ${edge.resource} connection"><title>${edge.resource}: ${nodeDef(from).name} → ${nodeDef(to).name} (click to disconnect)</title></path>`;
  }).join('');
  svg.innerHTML=curves;
}

function renderGraph(){
  $('#nodes').innerHTML=state.nodes.map(nodeMarkup).join('');
  drawLinks();
  updateNodeStats();
}
function updateNodeStats(){
  const grid=gridStatus(state,catalog);
  for(const n of state.nodes){
    const def=nodeDef(n),power=grid.efficiency.get(n.id)||0;
    const amount=Object.values(n.buffer).reduce((a,b)=>a+b,0);
    let label;
    if(!n.enabled)label='Paused';
    else if(def.power)label=`⚡ +${fmt(def.power*(1+0.2*(n.level-1)))} power`;
    else if(n.kind==='market'){
      const sale=marketActivity(n);
      const deliveries=state.edges.filter(e=>e.to===n.id&&e.resource!=='power');
      label=sale.units>0?`✓ Sold ${fmt(sale.units)} · +${money(sale.revenue)}`
        :!deliveries.length?'⚠ No material route'
        :amount>0?'● Goods ready to sell'
        :deliveries.some(e=>state.autoSell[e.resource])?'◌ Waiting for auto-sale goods':'◌ Waiting for delivered goods';
    }
    else if(power<0.99)label=`⚠ ${fmt(power*100,0)}% grid power`;
    else if(def.inputs && Object.entries(def.inputs).some(([r,q])=>(n.buffer[r]||0)<q))label='◌ Input constrained';
    else label=`● ${fmt(def.rate*(1+0.25*(n.level-1)))}/${def.output==='data'?'s data':'s'}`;
    const a=document.querySelector(`[data-node-rate="${n.id}"]`),b=document.querySelector(`[data-node-stock="${n.id}"]`);
    if(a)a.textContent=label;
    if(b)b.textContent=n.kind==='market'?`${fmt(amount)} stored · ${state.autoSell.metal?'metal auto-sell ON':'manual sales'}`:`${fmt(amount)} buffered`;
  }
  $('#network-summary').textContent=`${state.nodes.length} facilities · ${state.edges.length} links`;
}
function renderInspector(){
  const area=$('#inspector');const node=byId(state.selectedNode);
  if(inTutorial()){area.innerHTML='';return;}
  if(!node){area.innerHTML='<div class="card"><h2>Facility inspector</h2><p class="muted">Select a facility to inspect it.</p></div>';return;}
  const def=nodeDef(node),stock=Object.entries(node.buffer).filter(([,q])=>q>0.005).map(([r,q])=>`<div class="inventory-row"><span>${safe(catalog.resources[r]?.name||r)}</span><strong>${fmt(q)}</strong></div>`).join('')||'<p class="muted tiny">No materials buffered</p>';
  const inputs=Object.keys(def.inputs||{}).map(r=>`${catalog.resources[r].name}: ${fmt(def.inputs[r])}/s`).join(' · ');
  const upgrade=upgradeCost(node,catalog);
  const routes=state.edges.filter(e=>e.from===node.id||e.to===node.id).map(e=>{
    const other=byId(e.from===node.id?e.to:e.from);return `<div class="route-row"><span>${e.from===node.id?'→':'←'} ${safe(other?nodeDef(other).name:'Unknown')} <small>${safe(e.resource)}</small></span><button data-action="unlink" data-id="${e.id}" title="Disconnect">×</button></div>`;
  }).join('')||'<p class="muted tiny">No connections yet</p>';
  area.innerHTML=`<div class="card inspector-card"><div class="eyebrow">FACILITY INSPECTOR</div><h2>${def.icon} ${safe(def.name)}</h2><p class="muted">${safe(def.description)}</p><div class="stat-pair"><span>Level</span><strong>${node.level} / 20</strong></div><div class="stat-pair"><span>Industrial slots</span><strong>${def.slots}</strong></div><div class="stat-pair"><span>Inputs</span><strong>${inputs||'None'}</strong></div><div class="stat-pair"><span>Output</span><strong>${def.output|| (def.power?`${def.power} power`:'None · receives goods')}</strong></div>
    <div class="inspector-actions"><button data-action="upgrade" data-id="${node.id}" ${state.credits>=upgrade&&node.level<20?'':'disabled'}>↑ Upgrade · ${money(upgrade)}</button><button data-action="toggle" data-id="${node.id}">${node.enabled?'Pause':'Resume'}</button><button class="danger" data-action="demolish" data-id="${node.id}">Recycle</button></div>
    <h3>Local inventory <small>${fmt(capacity(state,node))} cap per item</small></h3>${stock}<h3>Connections</h3>${routes}<p class="tiny muted">Ports: blue-green = material; gold = power. Select an output then a matching input to connect.</p></div>`;
}
function renderOverview(){
  const g=gridStatus(state,catalog);
  const totals=Object.keys(catalog.resources).filter(r=>r!=='data').map(r=>[r,state.nodes.reduce((sum,n)=>sum+(n.buffer[r]||0),0)]).filter(([,n])=>n>0.01);
  $('#overview').innerHTML=`<div class="stat-pair"><span>Generated power</span><strong>${fmt(g.supply)}/s</strong></div><div class="stat-pair"><span>Power demand</span><strong>${fmt(g.demand)}/s</strong></div><div class="stat-pair"><span>Grid efficiency</span><strong>${g.demand?fmt(Math.min(100,g.supply/g.demand*100),0):100}%*</strong></div><div class="stat-pair"><span>Warehoused goods</span><strong>${fmt(totals.reduce((n,[,v])=>n+v,0))}</strong></div><div class="divider"></div>${totals.map(([id,value])=>`<div class="inventory-row"><span>${safe(catalog.resources[id].name)}</span><strong>${fmt(value)}</strong></div>`).join('')}<p class="muted tiny">*Each isolated grid is calculated separately. Select a node to inspect its actual supply.</p>`;
}
function renderLayouts(){
  $('#layouts').innerHTML=state.layouts.length?state.layouts.map((layout,i)=>`<div class="route-row"><span>${safe(layout.name)} <small>${layout.nodes.length} facilities</small></span><button data-action="layout-load" data-id="${i}">Build</button><button data-action="layout-delete" data-id="${i}" title="Delete blueprint">×</button></div>`).join(''):'<p class="muted tiny">No saved layouts yet.</p>';
}
function renderContracts(){
  $('#contracts-list').innerHTML=catalog.contracts.map(c=>{
    const qty=marketQuantity(state,c.resource),ready=contractAvailable(state,c);
    const cooldown=Math.ceil((state.contractRuns[c.id]||0)-state.runElapsed);
    const pct=Math.min(100,qty/c.amount*100);
    return `<article class="contract"><div class="contract-top"><div><div class="eyebrow">${safe(catalog.resources[c.resource].name).toUpperCase()} ORDER</div><h3>${safe(c.title)}</h3></div><strong class="value">+${money(c.reward*(1+0.2*(state.specialization==='strategist'?(state.talents.negotiation||0):0)))}</strong></div><p class="muted tiny">${safe(c.description)}</p><div class="progress"><span style="width:${pct}%"></span></div><div class="contract-bottom"><span>${fmt(qty)} / ${c.amount} at terminals</span><button data-action="contract" data-id="${c.id}" ${ready&&qty+0.000001>=c.amount?'':'disabled'}>${ready?'Deliver goods':`Restock ${timeLabel(cooldown)}`}</button></div></article>`;
  }).join('');
  $('#market-list').innerHTML=Object.entries(catalog.resources).filter(([,r])=>r.price>0).map(([id,r])=>{
    const qty=marketQuantity(state,id),auto=state.autoSell[id],canAuto=id==='metal'||(state.specialization==='architect'&&state.talents.automation>0);
    return `<div class="market-row"><div class="market-name"><span class="market-dot" style="background:${r.color}"></span><div><strong>${safe(r.name)}</strong><small>${fmt(qty)} in terminals · ${money(price(state,catalog,id))}/unit</small></div></div><div class="market-actions"><button data-action="autosell" data-id="${id}" ${canAuto?'':'disabled'} title="${canAuto?'Toggle automatic sales':'Automation talent unlocks automated sales'}">${auto?'AUTO ON':'AUTO OFF'}</button><button data-action="sell" data-id="${id}" ${qty>0?'':'disabled'}>Sell</button></div></div>`;
  }).join('');
}
function renderManagement(){
  const level=managerLevel(state),points=availableTalentPoints(state);
  $('#level-stats').innerHTML=`<div><small>MANAGEMENT LEVEL</small><strong>${level}</strong></div><div><small>FREE TALENT POINTS</small><strong>${points}</strong></div><div><small>CAREER XP</small><strong>${fmt(state.xp)}</strong></div>`;
  $('#talent-branches').innerHTML=Object.entries(catalog.talents).map(([id,branch])=>{
    const active=id===state.specialization;
    return `<article class="card talent-branch ${active?'active':''}"><div class="talent-symbol">${branch.icon}</div><h2>${branch.name}</h2><p class="muted">${branch.description}</p><button class="branch-switch" data-action="specialization" data-id="${id}" ${active?'disabled':''}>${active?'✓ Active specialization':'Switch specialization'}</button><div class="divider"></div>${branch.talents.map(t=>{
      const rank=state.talents[t.id]||0;
      return `<div class="talent-item"><div><strong>${t.name}</strong><small>${t.description}</small><span class="rank">${rank} / ${t.max}</span></div><button data-action="talent" data-id="${t.id}" ${active&&points>0&&rank<t.max?'':'disabled'}>＋</button></div>`;
    }).join('')}</article>`;
  }).join('');
}
function renderResearch(){
  $('#research-list').innerHTML=Object.entries(catalog.research).map(([id,r])=>{
    const owned=state.research[id];const requirements=r.requires.filter(dep=>!state.research[dep]);
    return `<article class="card research-item ${owned?'completed':''}"><div class="eyebrow">R&D PROTOCOL</div><h2>${safe(r.name)}</h2><p>${safe(r.description)}</p><div class="research-footer"><span>${owned?'✓ UNLOCKED':`${fmt(r.cost)} data`}</span><button data-action="research" data-id="${id}" ${!owned&&requirements.length===0&&state.data>=r.cost?'':'disabled'}>${owned?'Completed':requirements.length?'Requires previous tech':'Research'}</button></div></article>`;
  }).join('');
}
function renderInvestors(){
  const gain=prestigeGain(state),value=companyValue(state,catalog);
  $('#valuation').innerHTML=`<div class="valuation-big">${money(value)}</div><div class="stat-pair"><span>Revenue this company</span><strong>${money(state.runRevenue)}</strong></div><div class="stat-pair"><span>Contracts completed</span><strong>${state.runContracts}</strong></div><div class="stat-pair"><span>New angels on restart</span><strong class="highlight">+${fmt(gain)}</strong></div><div class="stat-pair"><span>Angel balance</span><strong>${fmt(state.angels)}</strong></div>`;
  $('#prestige-btn').disabled=gain<1;
  $('#investment-list').innerHTML=Object.entries(catalog.investments).map(([id,item])=>{
    const rank=state.investments[id]||0,cost=Math.ceil(item.cost*Math.pow(item.growth,rank));
    return `<div class="investment-row"><div><strong>${safe(item.name)} <span class="rank">${rank}/${item.max}</span></strong><small>${safe(item.description)}</small></div><button data-action="invest" data-id="${id}" ${rank<item.max&&state.angels>=cost?'':'disabled'}>${rank>=item.max?'MAX':`${fmt(cost)} ◇`}</button></div>`;
  }).join('');
}
function renderStats(){
  $('#stats').innerHTML=[['Management level',managerLevel(state)],['Lifetime revenue',money(state.lifetimeRevenue)],['Total contracts',state.contractsFilled],['Successful investments',state.stats.resets],['Lifetime play time',timeLabel(state.elapsed)],['Saved factory templates',state.layouts.length]].map(([k,v])=>`<div class="stat-pair"><span>${k}</span><strong>${v}</strong></div>`).join('');
}
function guideTarget(){
  const target=tutorialPort(state,pending);
  if(!target)return null;
  const node=state.nodes.find(n=>n.kind===target.kind);
  if(!node)return null;
  return {node, target};
}
function focusGuidedTarget(){
  const match=guideTarget();if(!match)return;
  const scroll=$('#editor-scroll');
  scroll.scrollTo({left:Math.max(0,match.node.x*canvasZoom-scroll.clientWidth*0.34),top:Math.max(0,match.node.y*canvasZoom-100),behavior:'smooth'});
}
function renderGuidance(){
  const active=inTutorial(),card=$('#tutorial-panel');
  document.body.classList.toggle('guided-mode',active);
  document.querySelectorAll('.tabs button').forEach(b=>{b.hidden=active&&b.dataset.tab!=='factory';});
  const step=TUTORIAL_STEPS[state.tutorialStep||0];
  $('#overview-card').hidden=active;
  $('#blueprints-card').hidden=active;
  $('#layout-save').hidden=active;
  $('#inspector').hidden=active;
  $('#facility-card').hidden=active&&!step.build;
  if(!active){card.hidden=true;return;}
  card.hidden=false;
  const progress=Math.round(((state.tutorialStep||0)/(TUTORIAL_STEPS.length-1))*100);
  card.innerHTML=`<div class="guide-kicker">INTERACTIVE TUTORIAL <span>STEP ${Math.min(TUTORIAL_STEPS.length,(state.tutorialStep||0)+1)} OF ${TUTORIAL_STEPS.length}</span></div><div class="guide-progress"><span style="width:${progress}%"></span></div><h2>${safe(step.title)}</h2><p>${safe(step.text)}</p><p class="guide-tip">💡 ${safe(step.hint)}</p><div class="guide-buttons">${step.done?'<button class="primary" id="guide-finish">Open the full game</button>':step.source?'<button id="guide-focus">⌖ Find highlighted port</button>':''}<button id="guide-skip" class="subtle">${practiceSnapshot?'Exit practice':'Skip tutorial'}</button></div>`;
  const guided=guideTarget();
  document.querySelectorAll('.port').forEach(p=>{
    const isTarget=guided&&p.dataset.node===guided.node.id&&p.dataset.port===guided.target.side&&p.dataset.resource===guided.target.resource;
    p.classList.toggle('tutorial-focus',!!isTarget);
    p.dataset.guideLabel=isTarget?(guided.target.side==='out'?'START HERE':'CONNECT HERE'):'';
  });
  if(step.source){
    $('#editor-hint').textContent=pending?'Now select the highlighted input port.':'Click the highlighted output port to start a connection.';
  }else{$('#editor-hint').textContent=step.done?'Training complete!':'Follow the highlighted tutorial instruction on the left.';}
}
function finishTutorial(){
  pending=null;
  if(practiceSnapshot){state=practiceSnapshot;practiceSnapshot=null;}
  else{state.onboarding=true;state.tutorialStep=TUTORIAL_STEPS.length-1;}
  $('#help-modal').classList.add('hidden');
  refresh();saveLocal();
  alertToast('Full factory unlocked. Enjoy building!');
}
function startPractice(){
  $('#help-modal').classList.add('hidden');
  if(!practiceSnapshot)practiceSnapshot=state;
  state=defaultState();
  state.lastSeen=Date.now();
  pending=null;activeTab='factory';
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='factory'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-factory'));
  refresh();$('#editor-scroll').scrollTo(0,0);
}
function refresh(){
  renderMetrics();
  if(activeTab==='factory'){renderFacilities();renderGraph();renderInspector();renderOverview();renderLayouts();}
  if(activeTab==='contracts')renderContracts();
  if(activeTab==='management')renderManagement();
  if(activeTab==='research')renderResearch();
  if(activeTab==='investors')renderInvestors();
  if(activeTab==='settings')renderStats();
  renderGuidance();
}
function liveRefresh(){
  renderMetrics();
  if(activeTab==='factory'){updateNodeStats();renderInspector();renderOverview();renderFacilities();}
  if(activeTab==='contracts')renderContracts();
  if(activeTab==='management')renderManagement();
  if(activeTab==='research')renderResearch();
  if(activeTab==='investors')renderInvestors();
  if(activeTab==='settings')renderStats();
  if(inTutorial())renderGuidance();
}
function selection(id){
  state.selectedNode=id;
  document.querySelectorAll('.factory-node').forEach(node=>node.classList.toggle('selected',node.dataset.nodeId===id));
  renderInspector();
}
function handlePort(button){
  const {node,port,resource}=button.dataset;
  const required=tutorialPort(state,pending);
  if(required){const correct=byId(node)?.kind===required.kind&&port===required.side&&resource===required.resource;
    if(!correct){alertToast('Follow the glowing port for this tutorial step.',true);return;}}
  if(port==='out'){
    pending={from:node,resource};
    $('#editor-hint').textContent=`Linking ${resource} from ${nodeDef(byId(node)).name} — select an input port.`;
    document.querySelectorAll('.port').forEach(el=>el.classList.toggle('pending',el===button));
    renderGuidance();focusGuidedTarget();return;
  }
  if(!pending){alertToast('Choose a source output port first.',true);return;}
  const expected=resource==='any'?pending.resource:resource;
  if(expected!==pending.resource){alertToast('Incompatible ports. Match resource type to input.',true);return;}
  const error=addEdge(state,catalog,pending.from,node,pending.resource);
  pending=null;
  runAction(error,'Connection established');
}
function userConfirm(message){return window.confirm(message);}
function handleAction(button){
  const {action,id,kind}=button.dataset;
  if(action==='select'){selection(id);return;}
  if(action==='build'){
    if(inTutorial()&&TUTORIAL_STEPS[state.tutorialStep]?.build!==kind)return;
    const scroll=$('#editor-scroll');
    const idx=state.nodes.length;
    const placement=inTutorial()?({smelter:{x:650,y:125},market:{x:960,y:125}}[kind]):null;
    const x=placement?.x??Math.min(2250,Math.round(scroll.scrollLeft/canvasZoom+200+(idx%3)*45));
    const y=placement?.y??Math.min(1400,Math.round(scroll.scrollTop/canvasZoom+200+(idx%5)*50));
    runAction(addFacility(state,catalog,kind,x,y),'Facility commissioned');
    if(inTutorial())focusGuidedTarget();return;
  }
  if(action==='upgrade'){runAction(upgradeFacility(state,catalog,id),'Machine upgraded');return;}
  if(action==='toggle'){const node=byId(id);if(node){node.enabled=!node.enabled;refresh();saveLocal();}return;}
  if(action==='demolish'){if(userConfirm('Recycle this facility for 40% of its base cost? Connected lines and inventory will be lost.'))runAction(removeFacility(state,catalog,id),'Facility recycled');return;}
  if(action==='unlink'){
    state.edges=state.edges.filter(e=>e.id!==id);runAction(null,'Connection removed');return;
  }
  if(action==='contract'){runAction(completeContract(state,catalog,id),'Contract fulfilled');return;}
  if(action==='autosell'){
    if(id!=='metal'&&!(state.specialization==='architect'&&state.talents.automation>0))return;
    state.autoSell[id]=!state.autoSell[id];runAction(null,state.autoSell[id]?'Auto-selling enabled':'Goods reserved for contracts');return;
  }
  if(action==='sell'){
    const qty=marketQuantity(state,id);
    if(qty>0){sell(state,catalog,id,qty);runAction(null,`Sold ${fmt(qty)} ${id}`);}return;
  }
  if(action==='research'){runAction(buyResearch(state,catalog,id),'Technology unlocked');return;}
  if(action==='talent'){runAction(buyTalent(state,catalog,id),'Talent improved');return;}
  if(action==='specialization'){runAction(setSpecialization(state,catalog,id),'Management specialization changed');return;}
  if(action==='invest'){runAction(buyInvestment(state,catalog,id),'Permanent investment acquired');return;}
  if(action==='layout-load'){
    if(userConfirm(`Rebuild the factory using blueprint "${state.layouts[Number(id)]?.name}"? This recycles current machines.`))runAction(loadLayout(state,catalog,Number(id)),'Blueprint rebuilt');return;
  }
  if(action==='layout-delete'){state.layouts.splice(Number(id),1);refresh();saveLocal();return;}
}
document.addEventListener('click',event=>{
  if(event.target.closest('#guide-finish')){finishTutorial();return;}
  if(event.target.closest('#guide-skip')){finishTutorial();return;}
  if(event.target.closest('#guide-focus')){focusGuidedTarget();return;}
  const port=event.target.closest('[data-port]');if(port){handlePort(port);return;}
  const action=event.target.closest('[data-action]');if(action){handleAction(action);return;}
  const edge=event.target.closest('[data-edge]');if(edge){state.edges=state.edges.filter(e=>e.id!==edge.dataset.edge);runAction(null,'Link disconnected');return;}
  const tab=event.target.closest('[data-tab]');if(tab)setTab(tab.dataset.tab);
});
$('#editor-world').addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button'))return;
  const head=e.target.closest('[data-drag]');if(!head)return;
  const node=byId(head.dataset.drag);if(!node)return;
  drag={id:node.id,x:node.x,y:node.y,sx:e.clientX,sy:e.clientY};
  head.setPointerCapture(e.pointerId);selection(node.id);
});
$('#editor-world').addEventListener('pointermove',e=>{
  if(!drag)return;
  const node=byId(drag.id);if(!node)return;
  const x=drag.x+(e.clientX-drag.sx)/canvasZoom,y=drag.y+(e.clientY-drag.sy)/canvasZoom;
  moveFacility(state,node.id,x,y);
  const element=document.querySelector(`[data-node-id="${node.id}"]`);
  if(element){element.style.left=`${node.x}px`;element.style.top=`${node.y}px`;}
  drawLinks();
});
const stopDragging=()=>{if(drag){drag=null;saveLocal();}};
$('#editor-world').addEventListener('pointerup',stopDragging);
$('#editor-world').addEventListener('pointercancel',stopDragging);
window.addEventListener('pointerup',stopDragging);
/** Preserve the factory point under the cursor (or viewport center) during zoom. */
function zoomCanvas(nextZoom,anchorX,anchorY){
  const zoom=Math.max(MIN_CANVAS_ZOOM,Math.min(MAX_CANVAS_ZOOM,Math.round(nextZoom*100)/100));
  if(zoom===canvasZoom)return;
  const scroll=$('#editor-scroll');
  const ax=anchorX??scroll.clientWidth/2, ay=anchorY??scroll.clientHeight/2;
  const worldX=(scroll.scrollLeft+ax)/canvasZoom, worldY=(scroll.scrollTop+ay)/canvasZoom;
  canvasZoom=zoom;
  $('#editor-stage').style.width=`${CANVAS_W*zoom}px`;
  $('#editor-stage').style.height=`${CANVAS_H*zoom}px`;
  $('#editor-world').style.transform=`scale(${zoom})`;
  scroll.scrollLeft=worldX*zoom-ax;
  scroll.scrollTop=worldY*zoom-ay;
  $('#zoom-value').textContent=`${Math.round(zoom*100)}%`;
  $('#zoom-out').disabled=zoom<=MIN_CANVAS_ZOOM;
  $('#zoom-in').disabled=zoom>=MAX_CANVAS_ZOOM;
  drawLinks();
}
function fitFactory(){
  const scroll=$('#editor-scroll');
  if(!state.nodes.length){zoomCanvas(1);scroll.scrollTo(0,0);return;}
  const minX=Math.max(0,Math.min(...state.nodes.map(n=>n.x))-36);
  const minY=Math.max(0,Math.min(...state.nodes.map(n=>n.y))-36);
  const maxX=Math.max(...state.nodes.map(n=>n.x+207))+36;
  const maxY=Math.max(...state.nodes.map(n=>n.y+170))+36;
  const zoom=Math.max(MIN_CANVAS_ZOOM,Math.min(1,(scroll.clientWidth-24)/(maxX-minX),(scroll.clientHeight-24)/(maxY-minY)));
  zoomCanvas(zoom);
  scroll.scrollTo({left:Math.max(0,(minX+maxX)*canvasZoom/2-scroll.clientWidth/2),top:Math.max(0,(minY+maxY)*canvasZoom/2-scroll.clientHeight/2)});
}
$('#zoom-out').addEventListener('click',()=>zoomCanvas(canvasZoom-0.1));
$('#zoom-in').addEventListener('click',()=>zoomCanvas(canvasZoom+0.1));
$('#zoom-fit').addEventListener('click',fitFactory);
$('#editor-scroll').addEventListener('wheel',event=>{
  if(!event.ctrlKey&&!event.metaKey)return; // Ordinary wheel continues to scroll the canvas.
  event.preventDefault(); // Prevent browser zoom while the pointer is on the canvas.
  const rect=event.currentTarget.getBoundingClientRect();
  zoomCanvas(canvasZoom+(event.deltaY>0?-0.1:0.1),event.clientX-rect.left,event.clientY-rect.top);
},{passive:false});
$('#center-btn').addEventListener('click',()=>{zoomCanvas(1);$('#editor-scroll').scrollTo({top:0,left:0,behavior:'smooth'});});
$('#layout-save').addEventListener('click',()=>{const name=prompt('Name this factory blueprint (up to 32 characters):','Efficient factory');if(name){saveLayout(state,name);runAction(null,'Blueprint archived');}});
$('#prestige-btn').addEventListener('click',()=>{
  const gained=prestigeGain(state);if(!gained)return;
  if(!userConfirm(`Sell this company for ${gained} angel investors? All factory machines, resources and research reset. Your investments, talents, XP and blueprints remain.`))return;
  const result=resetCompany(state);if(result.error){alertToast(result.error,true);return;}
  state=result.state;pending=null;setTab('factory');saveLocal();alertToast(`New company established · +${gained} angels`);
});
$('#save-btn').addEventListener('click',()=>{if(saveLocal())alertToast('Saved successfully');});
$('#export-btn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(JSON.parse(serializeSave(state)),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`idle-factory-save-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
});
$('#import-btn').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(file.size>5*1024*1024)throw new Error('Save file is too large');
    const parsed=sanitizeSave(JSON.parse(await file.text()),catalog);
    if(!userConfirm('Replace your current progress with this save? Export a backup first.'))return;
    state=parsed;simulate(state,catalog,Math.min(8*3600,(Date.now()-state.lastSeen)/1000),{offline:true});
    pending=null;refresh();saveLocal();alertToast('Save imported successfully');
  }catch(error){alertToast(`Import failed: ${error.message}`,true);}finally{e.target.value='';}
});
$('#reset-btn').addEventListener('click',()=>{
  if(!userConfirm('Permanently erase ALL Idle Factory progress? Export a backup first.'))return;
  if(!userConfirm('This cannot be undone. Confirm complete reset?'))return;
  state=defaultState();saveLocal();setTab('factory');alertToast('Progress erased');
});
const openHelp=()=>$('#help-modal').classList.remove('hidden');
const closeHelp=()=>$('#help-modal').classList.add('hidden');
$('#help-btn').addEventListener('click',openHelp);
$('#close-help').addEventListener('click',closeHelp);
$('#start-game').addEventListener('click',()=>{if(inTutorial()){closeHelp();focusGuidedTarget();}else startPractice();});
$('#help-modal').addEventListener('click',e=>{if(e.target.id==='help-modal')closeHelp();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){pending=null;document.querySelectorAll('.port.pending').forEach(el=>el.classList.remove('pending'));if(!$('#help-modal').classList.contains('hidden'))closeHelp();renderGuidance();}});

if(loaded.migrated)alertToast('Previous save detected: converted to Idle Factory v1.0');
const away=Math.max(0,Math.min(8*3600,(Date.now()-state.lastSeen)/1000));
if(away>=60){simulate(state,catalog,away,{offline:true});alertToast(`Offline operations: ${timeLabel(away)} at ${state.research.offline?'100%':'50%'} efficiency`);}
refresh();saveLocal();
if(inTutorial())advanceTutorial(state);
let lastTick=Date.now();
setInterval(()=>{
  const now=Date.now();const elapsed=Math.max(0,(now-lastTick)/1000);lastTick=now;
  if(elapsed>60)simulate(state,catalog,Math.min(8*3600,elapsed),{offline:true});
  else if(elapsed>0)simulate(state,catalog,elapsed);
  if(advanceTutorial(state)){refresh();if(inTutorial())focusGuidedTarget();}
  else liveRefresh();
},1000);
setInterval(saveLocal,10000);
window.addEventListener('pagehide',saveLocal);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveLocal();});

window.addEventListener('resize',drawLinks);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(drawLinks).observe($('#editor-world'));
