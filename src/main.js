import {loadCatalog} from './core/catalog.js';
import {SAVE_KEY,loadLocal,sanitizeSave,serializeSave,defaultState} from './core/state.js';
import {fmt,timeLabel} from './core/format.js';
import {simulate,gridStatus,price,marketQuantity,completeContract,contractAvailable,managerLevel,availableTalentPoints,prestigeGain,companyValue,capacity,sell,marketActivity,productionActivity,productionDiagnostics,maxProductionRate} from './core/engine.js';
import {usedSlots,totalSlots,upgradeCost,nodeCost,moveFacility,facilityLimit,nextCapacityMilestone,nextCapacityLevel} from './core/graph.js';
import {addFacility,removeFacility,addEdge,upgradeFacility,buyResearch,publishResearch,buyTalent,buyInvestment,resetCompany,saveLayout,loadLayout,respecTalents} from './core/actions.js';
import {TUTORIAL_STEPS,advanceTutorial,tutorialPort} from './core/tutorial.js';
import {routeConnection,routePath} from './core/router.js';
import {researchStatus,researchLicensingCost,researchLicensingReward} from './core/research.js';
import {INITIAL_CANVAS_WIDTH,INITIAL_CANVAS_HEIGHT,expandedWorkspace} from './core/workspace.js';
import {factoryLevel,nextFactoryLevelXp,talentStatus,pointsEarned,TIER_RULES,talentModifier,TALENT_UNLOCK_LEVEL} from './core/talents.js';
import {buildHudMetrics,renderHudHtml} from './core/hud.js';

const catalog=await loadCatalog();
const loaded=loadLocal(catalog);
let state=loaded.state;
let activeTab='factory';
let pending=null;
let drag=null;
let notifyTimer=null;
let practiceSnapshot=null; // Replays run in a disposable practice factory; player saves are untouched.
const MIN_CANVAS_ZOOM=0.05,MAX_CANVAS_ZOOM=1.75;
let canvasZoom=1; // Canvas-only zoom, never browser/page zoom.
let canvasWidth=INITIAL_CANVAS_WIDTH,canvasHeight=INITIAL_CANVAS_HEIGHT;
/** Resize the logical world and its SVG together, independently of zoom. */
function resizeCanvas(extraX=0,extraY=0){
  const next=expandedWorkspace(state.nodes,extraX,extraY,{width:canvasWidth,height:canvasHeight});
  if(next.width===canvasWidth&&next.height===canvasHeight)return;
  canvasWidth=next.width;canvasHeight=next.height;
  $('#editor-world').style.width=`${canvasWidth}px`;
  $('#editor-world').style.height=`${canvasHeight}px`;
  $('#links').setAttribute('viewBox',`0 0 ${canvasWidth} ${canvasHeight}`);
  $('#links').style.width=`${canvasWidth}px`;
  $('#links').style.height=`${canvasHeight}px`;
  $('#editor-stage').style.width=`${canvasWidth*canvasZoom}px`;
  $('#editor-stage').style.height=`${canvasHeight*canvasZoom}px`;
}
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
  const grid=gridStatus(state,catalog);
  $('#metrics').innerHTML=renderHudHtml(buildHudMetrics(state,catalog,grid,{fmt,money,tutorial:inTutorial()}));
}
function renderFacilities(){
  const step=TUTORIAL_STEPS[state.tutorialStep||0],milestone=nextCapacityMilestone(state);
  const list=Object.entries(catalog.facilities).filter(([kind])=>!inTutorial() || kind===step?.build).map(([kind,def])=>{
    const unlocked=state.runRevenue>=def.unlock,cost=nodeCost(kind,state,catalog);
    const owned=state.nodes.filter(n=>n.kind===kind).length,limit=facilityLimit(state,kind);
    const allowed=unlocked&&owned<limit&&state.credits>=cost&&usedSlots(state,catalog)+def.slots<=totalSlots(state);
    const description=unlocked?`${owned}/${limit} · ${def.slots} slots · ${money(cost)}`
      :`Unlock at ${money(def.unlock)} revenue (${money(Math.max(0,def.unlock-state.runRevenue))} remaining)`;
    const tip=!unlocked?`Earn ${money(def.unlock)} revenue in this company to unlock ${def.name}.`
      :owned>=limit?`Limit reached. Next expansion: ${milestone?money(milestone)+' run revenue':'Industrial Estate investment'}.`:def.description;
    return `<div class="build-item ${!unlocked?'locked':''} ${inTutorial()&&kind===step?.build?'tutorial-highlight':''}"><span class="build-icon" style="--accent:${def.color}">${def.icon}</span><div class="build-copy"><strong>${safe(def.name)}</strong><small title="${safe(tip)}">${description}</small></div><button data-action="build" data-kind="${kind}" ${allowed?'':'disabled'} title="${safe(tip)}">＋</button></div>`;
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
    <div class="port-set right">${out?port('out',out,`Output: ${catalog.resources[out]?.name||out}`):''}${def.power?port('out','power','Electricity output from generator'):''}</div>
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
  const obstacles=state.nodes.map(n=>{
    const element=document.querySelector(`[data-node-id="${n.id}"]`);
    if(!element)return {x:n.x,y:n.y,width:207,height:158};
    const rect=element.getBoundingClientRect();
    return {x:n.x,y:n.y,width:rect.width/canvasZoom,height:rect.height/canvasZoom};
  });
  let blockedRoutes=0;
  const curves=state.edges.map(edge=>{
    const from=byId(edge.from),to=byId(edge.to);if(!from||!to)return '';
    const a=portCenter(from.id,'out',edge.resource),b=portCenter(to.id,'in',edge.resource);
    if(!a||!b)return '';
    const route=routeConnection(a,b,obstacles);
    if(!route.length){
      blockedRoutes++;
      return `<circle cx="${a.x+15}" cy="${a.y}" r="6" fill="#eb8b97" stroke="#f6d9d9" stroke-width="1.5" style="pointer-events:all"><title>Route blocked by another machine. Move machines apart to reveal this connection.</title></circle>`;
    }
    const d=routePath(route);
    const color=edge.resource==='power'?'#f2db3d':(catalog.resources[edge.resource]?.color||'#63b9b7');
    const resourceName=edge.resource==='power'?'Power grid':(catalog.resources[edge.resource]?.name||edge.resource);
    return `<path d="${d}" class="edge-back"/><path d="${d}" stroke="${color}" stroke-width="${edge.resource==='power'?3.4:2.8}" ${edge.resource==='power'?'stroke-dasharray="9 6"':''} fill="none" stroke-linecap="round"/><path d="${d}" class="edge-hit" data-edge="${edge.id}" aria-label="Remove ${resourceName} connection"><title>${resourceName}: ${nodeDef(from).name} → ${nodeDef(to).name} (click to disconnect)</title></path>`;
  }).join('');
  svg.innerHTML=curves;
  svg.dataset.blockedRoutes=String(blockedRoutes);
}
function renderGraph(){
  resizeCanvas();
  $('#nodes').innerHTML=state.nodes.map(nodeMarkup).join('');
  drawLinks();
  updateNodeStats();
}
function updateNodeStats(){
  const grid=gridStatus(state,catalog);
  for(const n of state.nodes){
    const def=nodeDef(n),power=grid.efficiency.get(n.id)||0;
    const amount=Object.values(n.buffer).reduce((a,b)=>a+b,0);
    const activity=productionActivity(n),maxRate=maxProductionRate(state,n,catalog),actual=activity.rate;
    let label,bufferText='';
    if(!n.enabled)label='⏸ Paused';
    else if(def.power)label=`⚡ +${fmt(def.power*(1+0.5*(n.level-1))*(1+talentModifier(state,'powerGeneration')))} generated`;
    else if(n.kind==='market'){
      const sale=marketActivity(n),deliveries=state.edges.filter(e=>e.to===n.id&&e.resource!=='power');
      label=sale.units>0?`✓ Sold ${fmt(sale.units)} · +${money(sale.revenue)}`
        :!deliveries.length?'⚠ No material route'
        :amount>0?'● Goods ready to sell'
        :deliveries.some(e=>state.autoSell[e.resource])?'◌ Waiting for auto-sale goods':'◌ Waiting for delivered goods';
    }
    else if(def.output){
      const diagnostics=productionDiagnostics(n);
      const primary=Object.entries(diagnostics.limits).sort((a,b)=>b[1]-a[1])[0]?.[0];
      const reason=primary==='power'?'Power':primary==='storage'?'Full output':primary==='offline'?'Offline':primary?(catalog.resources[primary]?.name||primary):null;
      const filled=def.output!=='data' && (n.buffer[def.output]||0)>capacity(state,n)-0.15;
      const rateText=`${fmt(actual)}/${fmt(maxRate)} ${def.output==='data'?'data':'units'}/s`;
      label=actual>=maxRate*0.95?`● ${rateText}`
        :reason?`⚠ ${reason} limited · ${rateText}`
        :power<0.99?`⚠ Power limited · ${rateText}`
        :filled?`⚠ Output full · ${rateText}`:`◌ Startup / settling · ${rateText}`;
    }else label='● Ready';
    if(n.kind==='market')bufferText=`${fmt(amount)} stored · ${state.autoSell.metal?'metal auto-sell ON':'manual metal sales'}`;
    else if(def.output&&def.output!=='data')bufferText=`${catalog.resources[def.output]?.name||def.output}: ${fmt(n.buffer[def.output]||0)} stored`;
    else if(def.output==='data')bufferText='Research data sent directly to R&D';
    else bufferText='Power distribution grid';
    const a=document.querySelector(`[data-node-rate="${n.id}"]`),b=document.querySelector(`[data-node-stock="${n.id}"]`);
    if(a){a.textContent=label;a.title=label;}
    if(b){b.textContent=bufferText;b.title=bufferText;}
  }
  const blocked=Number($('#links').dataset.blockedRoutes||0);
  $('#network-summary').textContent=`${state.nodes.length} facilities · ${state.edges.length} links${blocked?` · ⚠ ${blocked} obstructed (move cards)`:''}`;
}
function limitName(id){
  if(id==='power')return 'Insufficient electricity';
  if(id==='storage')return 'Full output storage';
  if(id==='offline')return 'Offline efficiency';
  return `${catalog.resources[id]?.name||id} supply`;
}
function limitingReasons(node){
  const diagnostic=productionDiagnostics(node);
  return Object.entries(diagnostic.limits).sort((a,b)=>b[1]-a[1]).map(([key,seconds])=>({key,label:limitName(key),seconds}));
}
function renderInspector(){
  const area=$('#inspector');const node=byId(state.selectedNode);
  if(inTutorial()){area.innerHTML='';return;}
  if(!node){area.innerHTML='<div class="card"><h2>Facility inspector</h2><p class="muted">Select a facility to inspect it.</p></div>';return;}
  const def=nodeDef(node),tracked=new Set([...Object.keys(def.inputs||{}),...(def.output&&def.output!=='data'?[def.output]:[]),...Object.entries(node.buffer).filter(([,qty])=>qty>0.005).map(([resource])=>resource)]),stock=[...tracked].map(resource=>`<div class="inventory-row"><span>${safe(catalog.resources[resource]?.name||resource)}${def.output===resource?' (output)':''}</span><strong>${fmt(node.buffer[resource]||0)}</strong></div>`).join('')||'<p class="muted tiny">No materials buffered</p>';
  const inputs=Object.keys(def.inputs||{}).map(r=>`${catalog.resources[r].name}: ${fmt(def.inputs[r])}/s`).join(' · ');
  const upgrade=upgradeCost(node,catalog);
  const currentPerformance=def.output?maxProductionRate(state,node,catalog):def.power?def.power*(1+0.5*(node.level-1))*(1+talentModifier(state,'powerGeneration')):capacity(state,node);
  const nextPerformance=def.output?maxProductionRate(state,{...node,level:node.level+1},catalog):def.power?def.power*(1+0.5*node.level)*(1+talentModifier(state,'powerGeneration')):capacity(state,{...node,level:node.level+1});
  const performanceUnit=def.output?' units/s':def.power?' power':' storage/item';
  const routes=state.edges.filter(e=>e.from===node.id||e.to===node.id).map(e=>{
    const other=byId(e.from===node.id?e.to:e.from);return `<div class="route-row"><span>${e.from===node.id?'→':'←'} ${safe(other?nodeDef(other).name:'Unknown')} <small>${safe(catalog.resources[e.resource]?.name||(e.resource==='power'?'Power grid':e.resource))}</small></span><button data-action="unlink" data-id="${e.id}" title="Disconnect">×</button></div>`;
  }).join('')||'<p class="muted tiny">No connections yet</p>';
  const diagnostic=productionDiagnostics(node),stats=productionActivity(node),reasons=limitingReasons(node);
  const ideal=maxProductionRate(state,node,catalog),powerEff=gridStatus(state,catalog).efficiency.get(node.id)||0;
  const util=ideal>0?Math.min(100,100*stats.rate/ideal):100;
  const reasonsHtml=reasons.length?reasons.slice(0,4).map(reason=>`<div class="diagnostic-row warning"><span>${safe(reason.label)}</span><strong>${fmt(100*reason.seconds/Math.max(0.001,diagnostic.seconds),0)}% of last interval</strong></div>`).join(''):'<p class="tiny muted">No measured constraints yet, or the factory is running at its expected rate.</p>';
  const inputDiagnostics=Object.entries(def.inputs||{}).map(([id,amount])=>{
    const hasRoute=state.edges.some(edge=>edge.to===node.id&&edge.resource===id);
    const supply=diagnostic.seconds>0?(diagnostic.received[id]||0)/diagnostic.seconds:0;
    const target=def.rate?amount*ideal/def.rate*Math.max(0.2,1-talentModifier(state,'inputSavings')):amount;
    const stored=node.buffer[id]||0;
    return `<div class="diagnostic-row ${!hasRoute?'warning':''}"><span>${safe(catalog.resources[id]?.name||id)} ${hasRoute?'':'(no incoming link)'}</span><strong>${fmt(supply)}/${fmt(target)} per s · ${fmt(stored)} stored</strong></div>`;
  }).join('');
  const outStock=def.output&&def.output!=='data'?node.buffer[def.output]||0:0;
  const outputUsage=def.output&&def.output!=='data'?`<div class="diagnostic-row"><span>Output buffer</span><strong>${fmt(outStock)} / ${fmt(capacity(state,node))}</strong></div>`:'';
  const diagnosticHtml=def.output?`<div class="factory-diagnostics"><strong>Actual production: ${fmt(stats.rate)} / ${fmt(ideal)} per second (${fmt(util,0)}%)</strong><p class="tiny muted">Measured in the latest simulation. Limiters below are recorded while resources are consumed, not inferred from leftover stock.</p>${reasonsHtml}<div class="diagnostic-row ${powerEff<0.999?'warning':''}"><span>Electrical supply</span><strong>${fmt(powerEff*100,0)}% of demand</strong></div>${inputDiagnostics}${outputUsage}</div>`:'';
  area.innerHTML=`<div class="card inspector-card"<div class="eyebrow">FACILITY INSPECTOR</div><h2>${def.icon} ${safe(def.name)}</h2><p class="muted">${safe(def.description)}</p><div class="stat-pair"><span>Level</span><strong>${node.level} / 20</strong></div><div class="stat-pair"><span>Industrial slots</span><strong>${def.slots}</strong></div><div class="stat-pair"><span>Facilities of this type</span><strong>${state.nodes.filter(n=>n.kind===node.kind).length} / ${facilityLimit(state,node.kind)}</strong></div><div class="stat-pair"><span>Upgrade benefit</span><strong>${fmt(currentPerformance)} → ${fmt(nextPerformance)} ${performanceUnit}</strong></div><div class="stat-pair"><span>Inputs</span><strong>${inputs||'None'}</strong></div><div class="stat-pair"><span>Output</span><strong>${def.output?(catalog.resources[def.output]?.name||def.output): (def.power?`${def.power} electricity`:'None · receives goods')}</strong></div>
    <div class="inspector-actions"><button data-action="upgrade" data-id="${node.id}" ${state.credits>=upgrade&&node.level<20?'':'disabled'}>↑ Upgrade · ${money(upgrade)}</button><button data-action="toggle" data-id="${node.id}">${node.enabled?'Pause':'Resume'}</button><button class="danger" data-action="demolish" data-id="${node.id}">Recycle</button></div>
    <h3>Local inventory <small>${fmt(capacity(state,node))} cap per item</small></h3>${stock}${diagnosticHtml}<h3>Connections</h3>${routes}<p class="tiny muted">Only Power Stations and Solar Arrays have power outputs. Connect their yellow ports directly to each consuming machine.</p></div>`;
}
function renderOverview(){
  const g=gridStatus(state,catalog);
  const totals=Object.keys(catalog.resources).filter(r=>r!=='data').map(r=>[r,state.nodes.reduce((sum,n)=>sum+(n.buffer[r]||0),0)]).filter(([,n])=>n>0.01);
  $('#overview').innerHTML=`<div class="stat-pair"><span>Generated power</span><strong>${fmt(g.supply)}/s</strong></div><div class="stat-pair"><span>Power demand</span><strong>${fmt(g.demand)}/s</strong></div><div class="stat-pair"><span>Grid efficiency</span><strong>${g.demand?fmt(Math.min(100,g.supply/g.demand*100),0):100}%*</strong></div><div class="stat-pair"><span>Warehoused goods</span><strong>${fmt(totals.reduce((n,[,v])=>n+v,0))}</strong></div><div class="stat-pair"><span>Factory Level</span><strong>${factoryLevel(state)}</strong></div><div class="stat-pair"><span>Industrial slots</span><strong>${usedSlots(state,catalog)} / ${totalSlots(state)}</strong></div><div class="stat-pair"><span>Next level capacity gain</span><strong>Level ${nextCapacityLevel(state)??'MAX'} (+2 slots)</strong></div><div class="stat-pair"><span>Permanent capacity investment</span><strong>+${3*(state.investments.infrastructure||0)} slots</strong></div><p class="tiny muted">Gain Factory XP from sales and contracts, earn +2 industrial slots every 3 levels, or buy Industrial Estate with investors. Certain talents add more slots.</p><div class="divider"></div><h3>Production bottlenecks</h3>${(()=>{
    const constrained=state.nodes.filter(node=>node.enabled&&catalog.facilities[node.kind]?.output).map(node=>{
      const potential=maxProductionRate(state,node,catalog),actual=productionActivity(node).rate;
      return {node,ratio:potential>0?actual/potential:1,reason:limitingReasons(node)[0]?.label||'Waiting for production'};
    }).filter(v=>v.ratio<0.95).sort((a,b)=>a.ratio-b.ratio).slice(0,8);
    return constrained.length?`<div class="factory-health-list">${constrained.map(v=>`<button data-action="inspect" data-id="${v.node.id}" title="Inspect limiting factors"><span>${safe(nodeDef(v.node).name)} · ${safe(v.node.id)}</span><strong class="warning">${fmt(v.ratio*100,0)}% · ${safe(v.reason)}</strong></button>`).join('')}</div>`:'<p class="tiny muted">No production constraints detected. Select a machine for input-level details.</p>';
  })()}<div class="divider"></div>${totals.map(([id,value])=>`<div class="inventory-row"><span>${safe(catalog.resources[id].name)}</span><strong>${fmt(value)}</strong></div>`).join('')}<p class="muted tiny">*Each isolated grid is calculated separately. Select a node to inspect its actual supply.</p>`;
}
function renderLayouts(){
  $('#layouts').innerHTML=state.layouts.length?state.layouts.map((layout,i)=>`<div class="route-row"><span>${safe(layout.name)} <small>${layout.nodes.length} facilities</small></span><button data-action="layout-load" data-id="${i}">Build</button><button data-action="layout-delete" data-id="${i}" title="Delete blueprint">×</button></div>`).join(''):'<p class="muted tiny">No saved layouts yet.</p>';
}
function renderContracts(){
  $('#contracts-list').innerHTML=catalog.contracts.map(c=>{
    const qty=marketQuantity(state,c.resource),ready=contractAvailable(state,c);
    const remaining=Math.max(0,c.amount-qty),sellActive=!!state.autoSell[c.resource];
    const instructions=`Deliver ${c.amount} ${catalog.resources[c.resource].name} to a Trade Terminal. ${sellActive?'Disable AUTO selling of this resource first so stock can accumulate.':'Keep automatic selling OFF until you deliver.'}`;
    const completedToday=!ready;
    const cooldown=completedToday?'Resets tomorrow (00:00 UTC)':'';
    const pct=Math.min(100,qty/c.amount*100);
    return `<article class="contract"><div class="contract-top"><div><div class="eyebrow">${safe(catalog.resources[c.resource].name).toUpperCase()} ORDER</div><h3>${safe(c.title)}</h3></div><strong class="value">+${money(c.reward*(1+talentModifier(state,'contracts')))}</strong></div><p class="muted tiny">${safe(c.description)}</p><p class="contract-instructions">${safe(instructions)} ${remaining>0?fmt(remaining)+' more required.':'Ready for delivery.'}</p><div class="progress"><span style="width:${pct}%"></span></div><div class="contract-bottom"><span>${fmt(qty)} / ${c.amount} at terminals${completedToday?' · Resets 00:00 UTC':''}</span><button data-action="contract" data-id="${c.id}" ${ready&&qty+0.000001>=c.amount?'':'disabled'}>${ready?'Deliver goods':'Completed today'}</button></div></article>`;
  }).join('');
  $('#market-list').innerHTML=Object.entries(catalog.resources).filter(([,r])=>r.price>0).map(([id,r])=>{
    const qty=marketQuantity(state,id),auto=state.autoSell[id],canAuto=true;
    return `<div class="market-row"><div class="market-name"><span class="market-dot" style="background:${r.color}"></span><div><strong>${safe(r.name)}</strong><small>${fmt(qty)} in terminals · ${money(price(state,catalog,id))}/unit</small></div></div><div class="market-actions"><button data-action="autosell" data-id="${id}" ${canAuto?'':'disabled'} title="${canAuto?'Toggle automatic sales':'Automation talent unlocks automated sales'}">${auto?'AUTO ON':'AUTO OFF'}</button><button data-action="sell" data-id="${id}" ${qty>0?'':'disabled'}>Sell</button></div></div>`;
  }).join('');
}
let renderedTreeLevel=null;
function renderManagementHeader(){
  const level=factoryLevel(state),free=availableTalentPoints(state),next=nextFactoryLevelXp(state);
  const levelStart=60*(level-1)**2;
  const pct=next===null?100:Math.max(0,Math.min(100,100*(state.xp-levelStart)/(next-levelStart)));
  $('#level-stats').innerHTML=`<div class="factory-progression"><div class="factory-level-glyph">${level}</div><div class="factory-level-copy"><strong>Factory Level ${level}</strong><small>${next===null?'Maximum factory level':`${fmt(state.xp)} / ${fmt(next)} XP · ${fmt(Math.max(0,next-state.xp))} XP to next level`}</small><div class="progress factory-xp"><span style="width:${pct}%"></span></div></div><div class="factory-level-perks"><strong>${usedSlots(state,catalog)} / ${totalSlots(state)} slots</strong><small>+2 industrial slots every 3 factory levels</small><strong>${free} unspent talent points</strong><small>${level<TALENT_UNLOCK_LEVEL?`Talents unlock at level ${TALENT_UNLOCK_LEVEL}`:`${pointsEarned(state)} earned from levels`}</small></div></div>`;
}
function renderManagement(){
  renderManagementHeader();
  const level=factoryLevel(state);
  renderedTreeLevel=level;
  const branches=Object.entries(catalog.talents).map(([id,branch])=>{
    const spent=branch.nodes.reduce((sum,n)=>sum+(state.talents[n.id]||0),0);
    const paths=branch.nodes.flatMap(node=>(node.requires||[]).map(parentId=>{
      const parent=branch.nodes.find(n=>n.id===parentId);if(!parent)return '';
      const ax=50+100*(parent.col-1),ay=(parent.tier-1)*190+151;
      const bx=50+100*(node.col-1),by=(node.tier-1)*190+39;
      const active=(state.talents[parentId]||0)>0;
      return `<path d="M${ax} ${ay} C${ax} ${ay+24} ${bx} ${by-24} ${bx} ${by}" class="${active?'linked':''}"/>`;
    })).join('');
    const nodes=branch.nodes.map(node=>{
      const rank=state.talents[node.id]||0,status=talentStatus(state,catalog,node.id);
      const owned=rank>0,ready=status.enabled,choice=node.choice?' ◇ Doctrine choice':'';
      const title=`${node.name} (${rank}/${node.max})\n${node.description}\n${status.reason}`;
      const parents=(node.requires||[]).map(pid=>branch.nodes.find(n=>n.id===pid)?.name||pid).join(' / ');
      return `<button class="talent-node ${owned?'learned':''} ${ready?'learnable':''} ${!owned&&!ready?'unavailable':''}" data-action="talent" data-id="${node.id}" style="grid-row:${node.tier};grid-column:${node.col}" title="${safe(title)}" ${ready?'':'disabled'}><span class="talent-node-icon">${safe(node.icon)}</span><strong>${safe(node.name)}</strong><span class="talent-node-rank">${rank} / ${node.max}</span><small>${safe(node.description)}</small><span class="talent-status">${owned?rank===node.max?'✓ Complete':'✓ Invested':ready?'＋ Learn':status.reason}</span>${choice?`<em>${choice}</em>`:''}${parents?`<span class="talent-prereq">From: ${safe(parents)}</span>`:''}</button>`;
    }).join('');
    const tiers=Object.entries(TIER_RULES).map(([tier,rule])=>`<div class="talent-tier-label" style="top:${(Number(tier)-1)*190+2}px">Tier ${tier} · ${rule.spent} points spent in tree</div>`).join('');
    return `<article class="card talent-branch" style="--branch-color:${safe(branch.color)}"><header class="talent-tree-header"><span class="talent-tree-icon">${safe(branch.icon)}</span><div><h2>${safe(branch.name)}</h2><p>${safe(branch.description)}</p><small>${spent} points invested · ${branch.nodes.length} talents</small></div></header><div class="talent-map">${tiers}<svg class="talent-links" viewBox="0 0 300 950" preserveAspectRatio="none" aria-hidden="true">${paths}</svg><div class="talent-node-grid">${nodes}</div></div></article>`;
  }).join('');
  const unlock=level<TALENT_UNLOCK_LEVEL?`<div class="talent-lock-banner"><strong>Talent trees unlock at Factory Level ${TALENT_UNLOCK_LEVEL}</strong><p>Keep producing and fulfilling contracts to gain factory XP. No specialization is selected automatically.</p></div>`:'';
  $('#talent-branches').innerHTML=`${unlock}<div class="talent-tree-intro"><p>Build freely across all three trees. Deeper tiers require only earlier linked talents and points invested in that tree (after the level 5 talent unlock). Doctrine choices are mutually exclusive.</p><button data-action="respec" ${pointsEarned(state)&&Object.values(state.talents).some(Boolean)?'':'disabled'}>↺ Refund all talent points</button></div><div class="talent-tree-columns">${branches}</div>`;
}
function renderResearch(){
  const lab=catalog.facilities.lab, count=state.nodes.filter(n=>n.kind==='lab').length;
  const notice=count
    ?'<p class="muted tiny">Research Labs consume Devices and power to produce Research Data. Complete connected technologies, then license discoveries repeatedly for credits and XP.</p>'
    :`<p class="muted tiny">Build a Research Lab at ${money(lab.unlock)} run revenue (cost: ${money(lab.cost)}), then connect Devices and electricity.</p>`;
  const technologies=Object.values(catalog.research).sort((a,b)=>a.cost-b.cost);
  const byId=new Map(technologies.map(t=>[t.id,t]));
  const paths=technologies.flatMap(item=>(item.requires||[]).map(sourceId=>{
    const parent=byId.get(sourceId);if(!parent)return '';
    const x1=50+100*(parent.col-1),x2=50+100*(item.col-1);
    const y1=(parent.tier-1)*188+160,y2=(item.tier-1)*188+42;
    return `<path d="M${x1} ${y1} C${x1} ${y1+27} ${x2} ${y2-27} ${x2} ${y2}" class="${state.research[parent.id]?'linked':''}"/>`;
  })).join('');
  const cards=technologies.map(item=>{
    const status=researchStatus(state,catalog,item.id),owned=!!state.research[item.id];
    const prev=(item.requires||[]).map(id=>byId.get(id)?.name||id).join(' / ');
    return `<article class="research-node ${owned?'completed':status.ready?'available':'locked'}" style="grid-row:${item.tier};grid-column:${item.col}">
      <span class="research-node-icon">${owned?'✓':'⚗'}</span><strong>${safe(item.name)}</strong>
      <p>${safe(item.description)}</p><small>${owned?'Researched':fmt(item.cost)+' data'}</small>
      ${prev?`<small class="muted">Needs: ${safe(prev)}</small>`:''}
      <button data-action="research" data-id="${item.id}" ${status.ready?'':'disabled'}>${owned?'Completed':status.ready?'Research':safe(status.reason)}</button>
    </article>`;
  }).join('');
  const milestones=[12,35,75,135,240,420].map((_,i)=>`<span style="top:${i*188+3}px">Tier ${i+1}</span>`).join('');
  const completed=technologies.filter(r=>state.research[r.id]).length;
  const costs=researchLicensingCost(state),reward=researchLicensingReward(state),unlocked=completed>=6;
  $('#research-list').innerHTML=`<div class="research-head"><h2>Research & development</h2><p>${notice}</p><strong>${completed} / ${technologies.length} technologies completed · ${fmt(state.data)} Research Data available</strong></div>
    <div class="research-map"><div class="research-tier-labels">${milestones}</div><svg class="research-paths" viewBox="0 0 300 1128" preserveAspectRatio="none" aria-hidden="true">${paths}</svg><div class="research-node-grid">${cards}</div></div>
    <div class="research-license"><div><h3>Applied research licensing</h3><p>Spend Research Data to license discoveries for credits and Factory XP. Repeatable even after all technologies are complete; each deal costs more.</p><small>${state.researchLicenses||0} licenses completed · Next: ${fmt(costs)} data → ${money(reward)}</small></div><button data-action="research-license" ${unlocked&&state.data>=costs?'':'disabled'}>${!unlocked?'Unlock after 6 technologies':state.data<costs?'Need more Research Data':'License discoveries'}</button></div>`;
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
  if(activeTab==='management'){
    if(renderedTreeLevel!==factoryLevel(state))renderManagement();
    else renderManagementHeader();
  }
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
  if(action==='select'||action==='inspect'){
    selection(id);
    if(action==='inspect'){const node=byId(id),scroll=$('#editor-scroll');if(node)scroll.scrollTo({left:Math.max(0,(node.x+104)*canvasZoom-scroll.clientWidth/2),top:Math.max(0,(node.y+79)*canvasZoom-scroll.clientHeight/2),behavior:'smooth'});}
    return;
  }
  if(action==='build'){
    if(inTutorial()&&TUTORIAL_STEPS[state.tutorialStep]?.build!==kind)return;
    const scroll=$('#editor-scroll');
    const idx=state.nodes.length;
    const placement=inTutorial()?({smelter:{x:650,y:125},market:{x:960,y:125}}[kind]):null;
    const x=placement?.x??Math.max(0,Math.round(scroll.scrollLeft/canvasZoom+200+(idx%3)*45));
    const y=placement?.y??Math.max(0,Math.round(scroll.scrollTop/canvasZoom+200+(idx%5)*50));
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
    state.autoSell[id]=!state.autoSell[id];runAction(null,state.autoSell[id]?'Auto-selling enabled':'Goods reserved for contracts');return;
  }
  if(action==='sell'){
    const qty=marketQuantity(state,id);
    if(qty>0){sell(state,catalog,id,qty);runAction(null,`Sold ${fmt(qty)} ${id}`);}return;
  }
  if(action==='research'){runAction(buyResearch(state,catalog,id),'Technology unlocked');return;}
  if(action==='research-license'){runAction(publishResearch(state,catalog),'Research licensed for credits and Factory XP');return;}
  if(action==='talent'){runAction(buyTalent(state,catalog,id),'Talent improved');return;}
  if(action==='respec'){
    if(userConfirm('Refund all talent points? You can immediately choose a new build for free.'))runAction(respecTalents(state),'All talent points refunded');
    return;
  }
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
/** Include both pointer movement and viewport scrolling in drag coordinates. */
function updateDraggedNode(){
  if(!drag)return;
  const scroll=$('#editor-scroll'),node=byId(drag.id);if(!node)return;
  moveFacility(state,node.id,
    drag.x+(drag.cx-drag.sx+scroll.scrollLeft-drag.scrollX)/canvasZoom,
    drag.y+(drag.cy-drag.sy+scroll.scrollTop-drag.scrollY)/canvasZoom);
  const element=document.querySelector(`[data-node-id="${node.id}"]`);
  if(element){element.style.left=`${node.x}px`;element.style.top=`${node.y}px`;}
  resizeCanvas(node.x+207,node.y+180);
  drawLinks();
}
/** Dragging near a viewport edge pans into new factory space automatically. */
function autoPanDraggedNode(){
  if(!drag)return;
  const scroll=$('#editor-scroll'),rect=scroll.getBoundingClientRect(),edge=55;
  const rate=distance=>Math.min(24,Math.max(0,(edge-distance)/edge*24));
  const dx=drag.cx>rect.right-edge?rate(rect.right-drag.cx)
    :drag.cx<rect.left+edge?-rate(drag.cx-rect.left):0;
  const dy=drag.cy>rect.bottom-edge?rate(rect.bottom-drag.cy)
    :drag.cy<rect.top+edge?-rate(drag.cy-rect.top):0;
  if(dx||dy){
    resizeCanvas(
      (scroll.scrollLeft+scroll.clientWidth+Math.max(0,dx))/canvasZoom,
      (scroll.scrollTop+scroll.clientHeight+Math.max(0,dy))/canvasZoom);
    const prevX=scroll.scrollLeft,prevY=scroll.scrollTop;
    scroll.scrollLeft+=dx;scroll.scrollTop+=dy;
    if(scroll.scrollLeft!==prevX||scroll.scrollTop!==prevY)updateDraggedNode();
  }
  drag.frame=requestAnimationFrame(autoPanDraggedNode);
}
$('#editor-world').addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button'))return;
  const head=e.target.closest('[data-drag]');if(!head)return;
  const node=byId(head.dataset.drag);if(!node)return;
  const scroll=$('#editor-scroll');
  drag={id:node.id,x:node.x,y:node.y,sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,
    scrollX:scroll.scrollLeft,scrollY:scroll.scrollTop,pointerId:e.pointerId,frame:null};
  head.setPointerCapture(e.pointerId);selection(node.id);
  drag.frame=requestAnimationFrame(autoPanDraggedNode);
});
$('#editor-world').addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;
  drag.cx=e.clientX;drag.cy=e.clientY;updateDraggedNode();
});
const stopDragging=()=>{if(drag){cancelAnimationFrame(drag.frame);drag=null;saveLocal();}};
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
  $('#editor-stage').style.width=`${canvasWidth*zoom}px`;
  $('#editor-stage').style.height=`${canvasHeight*zoom}px`;
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
