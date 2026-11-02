import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,sanitizeSave} from '../src/core/state.js';
import {advanceTutorial,TUTORIAL_STEPS,tutorialPort} from '../src/core/tutorial.js';
import {simulate,gridStatus,marketQuantity,completeContract,prestigeGain,availableTalentPoints,managerLevel} from '../src/core/engine.js';
import {addFacility,addEdge,usedSlots,totalSlots} from '../src/core/graph.js';
import {resetCompany,saveLayout,loadLayout,buyInvestment,buyTalent,buyResearch} from '../src/core/actions.js';
import {tickOrders} from '../src/core/orders.js';
const read=id=>JSON.parse(readFileSync(new URL(`../data/catalog/${id}.json`,import.meta.url),'utf8'));
const catalog=Object.fromEntries(['facilities','resources','talents','research','investments','contracts'].map(id=>[id,read(id)]));
function workingFactory(){
 const s=defaultState();
 assert.equal(addEdge(s,catalog,'n1','n2','power'),null);
 assert.equal(addFacility(s,catalog,'smelter',650,125),null);
 const smelter=s.selectedNode;
 assert.equal(addEdge(s,catalog,'n2',smelter,'ore'),null);
 assert.equal(addEdge(s,catalog,'n1',smelter,'power'),null);
 assert.equal(addFacility(s,catalog,'market',960,125),null);
 assert.equal(addEdge(s,catalog,smelter,s.selectedNode,'metal'),null);
 return s;
}
test('starter graph makes and sells actual metal through linked machines',()=>{
 const s=workingFactory();const initial=s.credits;simulate(s,catalog,120);
 assert.ok(s.credits>initial);assert.ok(s.runRevenue>0);assert.ok(s.nodes.find(n=>n.kind==='smelter').buffer.metal<2);
});
test('disconnected grid cannot supply output',()=>{
 const s=workingFactory();s.edges=s.edges.filter(e=>e.resource!=='power');const initial=s.credits;simulate(s,catalog,120);
 assert.equal(s.credits,initial);assert.equal(s.runRevenue,0);assert.equal(s.nodes.find(n=>n.kind==='mine').buffer.ore||0,0);
});
test('unlinked material route cannot deliver inputs',()=>{
 const s=workingFactory();s.edges=s.edges.filter(e=>e.resource!=='ore');simulate(s,catalog,120);
 assert.equal(s.runRevenue,0);assert.ok(s.nodes.find(n=>n.kind==='mine').buffer.ore>0);
});
test('power networks are isolated',()=>{
 const s=workingFactory();const smelter=s.nodes.find(n=>n.kind==='smelter');s.edges=s.edges.filter(e=>e.to!==smelter.id||e.resource!=='power');
 const grid=gridStatus(s,catalog);assert.equal(grid.efficiency.get(smelter.id),0);
});
test('market autosell can be disabled to fill an order with secured goods',()=>{
 const s=workingFactory();s.autoSell.metal=false;s.onboarding=true;
 tickOrders(s,catalog,1);
 const order=s.orders.find(o=>o.resource==='metal');
 assert.ok(order,'Expected a live metal delivery order');
 simulate(s,catalog,160);
 assert.ok(order.reserved>=order.amount,'Production should secure the requested quantity');
 const before=s.credits;
 assert.equal(completeContract(s,catalog,order.id),null);
 assert.ok(s.credits>=before+order.reward);
 assert.equal(s.orderStats.fulfilled,1);
 assert.match(completeContract(s,catalog,order.id),/expired or is no longer available/);
});
test('rolling orders expire after their deadline and cannot be delivered',()=>{
 const s=workingFactory();
 tickOrders(s,catalog,1);
 const order=s.orders[0];
 assert.ok(order);
 tickOrders(s,catalog,order.expiresAt-s.orderClock+1);
 assert.ok(!s.orders.some(o=>o.id===order.id));
 assert.equal(s.orderStats.expired,1);
 assert.match(completeContract(s,catalog,order.id),/expired or is no longer available/);
});
test('construction spends credits and respects unlocks and capacity',()=>{
 const s=workingFactory();s.credits=10000;s.runRevenue=10000;
 assert.equal(addFacility(s,catalog,'press',540,340),null);
 assert.ok(usedSlots(s,catalog)<=totalSlots(s));
 const source=s.nodes.find(n=>n.kind==='smelter').id;
 assert.equal(addEdge(s,catalog,source,s.selectedNode,'metal'),null);
 assert.match(addEdge(s,catalog,source,s.selectedNode,'metal'),/already exists/);
 assert.match(addEdge(s,catalog,'n2',s.selectedNode,'ore'),/cannot consume/);
});
test('career talents need Factory Level 5 and available points; research needs data',()=>{
 const s=defaultState();assert.match(buyTalent(s,catalog,'engineer_t1_c1'),/Factory Level 5/);
 s.xp=5000;assert.ok(managerLevel(s)>=5);assert.ok(availableTalentPoints(s)>0);
 assert.equal(buyTalent(s,catalog,'engineer_t1_c1'),null);
 assert.equal(s.talents.engineer_t1_c1,1);
 assert.match(buyResearch(s,catalog,'logistics'),/Need 12 more Research Data/);
 s.data=20;assert.equal(buyResearch(s,catalog,'logistics'),null);
});
test('investor reset retains permanent upgrades and layouts',()=>{
 const s=defaultState();s.angels=12;s.runRevenue=32000;s.lifetimeRevenue=32000;s.xp=4500;
 assert.equal(buyInvestment(s,catalog,'capital'),null);saveLayout(s,'Starter');
 const r=resetCompany(s);assert.ok(r.earned>=3);
 assert.equal(r.state.investments.capital,1);assert.equal(r.state.xp,s.xp);
 assert.equal(r.state.layouts.length,1);assert.equal(r.state.nodes.length,4);
 assert.ok(r.state.credits>250);
});
test('saved layout costs money and restores links without free machines',()=>{
 const s=workingFactory();s.credits=10000;s.runRevenue=3000;
 assert.equal(addFacility(s,catalog,'press',1300,400),null);saveLayout(s,'Expanded');
 const oldIds=new Set(s.nodes.map(n=>n.id));
 assert.equal(loadLayout(s,catalog,0),null);
 assert.equal(s.nodes.length,5);assert.ok(s.nodes.every(n=>!oldIds.has(n.id)));
 assert.ok(s.credits<10000);
});
test('safe import accepts v2 starter migration and rejects future saves',()=>{
 const s=sanitizeSave({version:2,parts:500,blueprints:3,meta:{meta_start:1},stats:{prestiges:2}},catalog);
 assert.equal(s.version,3);assert.equal(s.credits,500);assert.equal(s.angels,3);
 assert.equal(s.stats.resets,2);assert.equal(s.investments.capital,1);
 assert.equal(s.nodes.length,4);assert.equal(s.edges.length,4);assert.equal(s.onboarding,true);
 assert.throws(()=>sanitizeSave({version:4},catalog),/newer/);
});
test('injected and invalid save data cannot become active game definitions',()=>{
 const raw=defaultState();raw.nodes[0].kind='unknown';raw.credits=Infinity;
 raw.talents={engineer_t1_c1:10000,lean:10000};raw.nodes[1].buffer={ore:-20};
 const s=sanitizeSave(JSON.parse(JSON.stringify(raw)),catalog);
 assert.equal(s.nodes.some(n=>n.kind==='unknown'),false);
 assert.equal(s.talents.engineer_t1_c1,2,'Known talent ranks must respect their cap');
 assert.equal(s.talents.lean,undefined,'Deprecated talent IDs must not become active');
 assert.equal(s.legacyTalentCredits,20,'Legacy talents should migrate to bounded credits');
 assert.equal(s.nodes[0].buffer.ore,0);
 assert.equal(s.credits,900);
});
test('prestige gain scales with contracts and production',()=>{
 const s=defaultState();assert.equal(prestigeGain(s),0);
 s.runRevenue=10000;s.runContracts=4;assert.ok(prestigeGain(s)>=3);
});

test('onboarding starts simple and advances only when actual player actions succeed',()=>{
 const s=defaultState();
 assert.equal(s.nodes.length,2);assert.equal(s.edges.length,0);assert.equal(s.tutorialStep,0);
 assert.equal(advanceTutorial(s),false);
 assert.deepEqual(tutorialPort(s,null),{side:'out',kind:'generator',resource:'power'});
 assert.equal(addEdge(s,catalog,'n1','n2','power'),null);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,1);
 assert.equal(addFacility(s,catalog,'smelter',650,125),null);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,2);
 const smelter=s.nodes.find(n=>n.kind==='smelter').id;
 assert.equal(addEdge(s,catalog,'n2',smelter,'ore'),null);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,3);
 assert.equal(addEdge(s,catalog,'n1',smelter,'power'),null);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,4);
 assert.equal(addFacility(s,catalog,'market',960,125),null);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,5);
 const market=s.nodes.find(n=>n.kind==='market').id;
 assert.equal(addEdge(s,catalog,smelter,market,'metal'),null);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,6);
 assert.equal(advanceTutorial(s),false);
 simulate(s,catalog,20);assert.ok(s.runRevenue>0);
 assert.equal(advanceTutorial(s),true);assert.equal(s.tutorialStep,TUTORIAL_STEPS.length-1);
});
test('tutorial step and older saves persist without destroying established factories',()=>{
 const s=defaultState();s.tutorialStep=4;
 const loaded=sanitizeSave(JSON.parse(JSON.stringify(s)),catalog);
 assert.equal(loaded.tutorialStep,4);assert.equal(loaded.nodes.length,2);
 const old={...workingFactory(),onboarding:true};delete old.tutorialStep;
 const restored=sanitizeSave(JSON.parse(JSON.stringify(old)),catalog);
 assert.equal(restored.onboarding,true);assert.equal(restored.nodes.length,4);
 const prior={...workingFactory(),onboarding:false};delete prior.tutorialStep;
 const upgraded=sanitizeSave(JSON.parse(JSON.stringify(prior)),catalog);
 assert.equal(upgraded.onboarding,true);assert.equal(upgraded.tutorialStep,7);
});
