import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,sanitizeSave} from '../src/core/state.js';
import {simulate,gridStatus,marketQuantity,completeContract,prestigeGain,availableTalentPoints,managerLevel} from '../src/core/engine.js';
import {addFacility,addEdge,usedSlots,totalSlots} from '../src/core/graph.js';
import {resetCompany,saveLayout,loadLayout,buyInvestment,buyTalent,buyResearch} from '../src/core/actions.js';
const read=id=>JSON.parse(readFileSync(new URL(`../data/catalog/${id}.json`,import.meta.url),'utf8'));
const catalog=Object.fromEntries(['facilities','resources','talents','research','investments','contracts'].map(id=>[id,read(id)]));
test('starter graph makes and sells actual metal through linked machines',()=>{
 const s=defaultState();simulate(s,catalog,120);
 assert.ok(s.credits>250);assert.ok(s.runRevenue>0);assert.ok(s.nodes.find(n=>n.kind==='smelter').buffer.metal<2);
});
test('disconnected grid cannot supply output',()=>{
 const s=defaultState();s.edges=s.edges.filter(e=>e.resource!=='power');simulate(s,catalog,120);
 assert.equal(s.credits,250);assert.equal(s.runRevenue,0);assert.equal(s.nodes.find(n=>n.kind==='mine').buffer.ore||0,0);
});
test('unlinked material route cannot deliver inputs',()=>{
 const s=defaultState();s.edges=s.edges.filter(e=>e.resource!=='ore');simulate(s,catalog,120);
 assert.equal(s.runRevenue,0);assert.ok(s.nodes.find(n=>n.kind==='mine').buffer.ore>0);
});
test('power networks are isolated',()=>{
 const s=defaultState();s.edges=s.edges.filter(e=>e.to!=='n3'||e.resource!=='power');
 const grid=gridStatus(s,catalog);assert.equal(grid.efficiency.get('n3'),0);
});
test('market autosell can be disabled to fulfill a contract',()=>{
 const s=defaultState();s.autoSell.metal=false;simulate(s,catalog,160);
 assert.ok(marketQuantity(s,'metal')>=25);
 const before=s.credits,stockBefore=marketQuantity(s,'metal');assert.equal(completeContract(s,catalog,'foundations'),null);
 assert.ok(s.credits>=before+260);assert.ok(Math.abs(marketQuantity(s,'metal')-(stockBefore-25))<1e-6);
 assert.match(completeContract(s,catalog,'foundations'),/cooldown/);
});
test('construction spends credits and respects unlocks and capacity',()=>{
 const s=defaultState();s.credits=10000;s.runRevenue=10000;
 assert.equal(addFacility(s,catalog,'press',540,340),null);
 assert.ok(usedSlots(s,catalog)<=totalSlots(s));
 assert.equal(addEdge(s,catalog,'n3',s.selectedNode,'metal'),null);
 assert.match(addEdge(s,catalog,'n3',s.selectedNode,'metal'),/already exists/);
 assert.match(addEdge(s,catalog,'n2',s.selectedNode,'ore'),/cannot consume/);
});
test('talents cost level points, and research needs data',()=>{
 const s=defaultState();assert.match(buyTalent(s,catalog,'lean'),/Earn management/);
 s.xp=5000;assert.ok(managerLevel(s)>1);assert.ok(availableTalentPoints(s)>0);
 assert.equal(buyTalent(s,catalog,'lean'),null);assert.equal(s.talents.lean,1);
 assert.match(buyResearch(s,catalog,'logistics'),/Insufficient/);
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
 const s=defaultState();s.credits=10000;s.runRevenue=3000;
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
 assert.throws(()=>sanitizeSave({version:4},catalog),/newer/);
});
test('injected and invalid save data cannot become active game definitions',()=>{
 const raw=defaultState();raw.nodes[0].kind='unknown';raw.credits=Infinity;raw.talents={lean:10000};raw.nodes[1].buffer={ore:-20};
 const s=sanitizeSave(JSON.parse(JSON.stringify(raw)),catalog);
 assert.equal(s.nodes.some(n=>n.kind==='unknown'),false);
 assert.equal(s.talents.lean,3);assert.equal(s.nodes[0].buffer.ore,0);
 assert.equal(s.credits,250);
});
test('prestige gain scales with contracts and production',()=>{
 const s=defaultState();assert.equal(prestigeGain(s),0);
 s.runRevenue=10000;s.runContracts=4;assert.ok(prestigeGain(s)>=3);
});
