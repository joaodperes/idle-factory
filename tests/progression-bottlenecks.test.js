import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,operatingGraph,makeNode,sanitizeSave} from '../src/core/state.js';
import {totalSlots,canConnect} from '../src/core/graph.js';
import {factoryLevel,freeTalentPoints,pointsEarned,talentStatus,talentModifier} from '../src/core/talents.js';
import {buyTalent,respecTalents} from '../src/core/actions.js';
import {simulate,productionDiagnostics,productionActivity,maxProductionRate,marketQuantity,completeContract} from '../src/core/engine.js';

const catalog={};
for(const name of ['facilities','resources','talents','research','investments','contracts']){
  catalog[name]=JSON.parse(readFileSync(new URL('../data/catalog/'+name+'.json',import.meta.url),'utf8'));
}
function advanced(xp=54000){return {...defaultState(),xp,credits:100000,runRevenue:300000};}
const operating=()=>{const s=defaultState(),g=operatingGraph();s.nodes=g.nodes;s.edges=g.edges;return s;};

test('new players begin with no chosen career and locked talents',()=>{
  const s=defaultState();
  assert.equal(s.careerTree,null);
  assert.equal(factoryLevel(s),1);
  assert.equal(pointsEarned(s),0);
  assert.equal(freeTalentPoints(s),0);
  assert.match(talentStatus(s,catalog,'engineer_t1_c1').reason,/Level 5/);
});
test('factory level five unlocks the first career; capacity grows every third level',()=>{
  const s=defaultState();
  assert.equal(totalSlots(s),26);
  s.xp=416;
  assert.equal(factoryLevel(s),5);
  assert.equal(totalSlots(s),28);
  assert.equal(pointsEarned(s),1);
  assert.equal(talentStatus(s,catalog,'engineer_t1_c1').enabled,true);
  assert.equal(buyTalent(s,catalog,'engineer_t1_c1'),null);
  assert.equal(s.careerTree,'engineer');
  assert.equal(freeTalentPoints(s),0);
});
test('career tiers need allocated points and a connected prerequisite',()=>{
  const s=advanced(1e10);
  s.talents={engineer_t1_c1:2,engineer_t1_c2:2,engineer_t1_c3:2};
  s.careerTree='engineer';
  assert.equal(talentStatus(s,catalog,'engineer_t2_c2').enabled,true);
  assert.match(buyTalent({...s,talents:{engineer_t1_c1:2,engineer_t1_c3:2}},catalog,'engineer_t2_c2'),/Spend/);
});
test('choosing Engineering locks the Scientist and Business careers until capstone',()=>{
  const s=advanced(1e10);
  assert.equal(buyTalent(s,catalog,'engineer_t1_c1'),null);
  assert.match(buyTalent(s,catalog,'scientist_t1_c1'),/Finish/);
  assert.ok(talentModifier(s,'output')>0);
});
test('respec is locked during a career and preserves auto-sale preferences afterward',()=>{
  const s=advanced(1e10);s.autoSell={metal:true,parts:true};
  assert.equal(buyTalent(s,catalog,'engineer_t1_c1'),null);
  assert.match(respecTalents(s,catalog),/Finish/);
  s.completedCareers=['engineer'];s.careerTree=null;
  assert.equal(respecTalents(s,catalog),null);
  assert.equal(freeTalentPoints(s),pointsEarned(s));
  assert.equal(s.autoSell.parts,true);
});
test('retired talent allocations become refundable career points and power links migrate',()=>{
  const original=operating(),smelter=original.nodes.find(n=>n.kind==='smelter');
  const mine=original.nodes.find(n=>n.kind==='mine');
  original.edges=original.edges.filter(e=>e.resource!=='power');
  original.edges.push({id:'e8',from:'n1',to:mine.id,resource:'power'},{id:'e9',from:mine.id,to:smelter.id,resource:'power'});
  original.talents={precision:2,lean:1};original.specialization='engineer';
  const restored=sanitizeSave({...original,version:3},catalog);
  assert.equal(restored.specialization,null);
  assert.equal(restored.legacyTalentCredits,3);
  assert.ok(restored.edges.some(e=>e.from==='n1'&&e.to===smelter.id&&e.resource==='power'));
  assert.ok(restored.edges.filter(e=>e.resource==='power').every(e=>catalog.facilities[restored.nodes.find(n=>n.id===e.from).kind].power>0));
});
test('power connections originate only from generators, despite legacy relays',()=>{
  const s=operating();
  assert.match(canConnect(s,catalog,'n2','n3','power'),/Only Power Stations/);
  assert.equal(canConnect(s,catalog,'n1','n3','power')?.startsWith('That link'),true);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/def\.power\?port\('out','power'/);
  assert.doesNotMatch(main,/power-relay/);
});
test('customer orders can be fulfilled with reserved Trade Terminal inventory',()=>{
  const s=operating();s.onboarding=true;s.autoSell.metal=false;
  simulate(s,catalog,1);
  const order=s.orders[0];
  assert.ok(order);
  const terminal=s.nodes.find(n=>n.kind==='market');
  terminal.buffer[order.resource]=order.amount;
  assert.equal(completeContract(s,catalog,order.id),null);
  assert.equal(s.runContracts,1);
  assert.equal(s.orderStats.fulfilled,1);
});
test('diagnostics identify absent ore, insufficient power, and full output storage',()=>{
  const s=defaultState(),smelter=makeNode('sm','smelter',400,180);
  s.nodes.push(smelter);
  s.edges.push({id:'p',from:'n1',to:'sm',resource:'power'});
  simulate(s,catalog,2);
  assert.ok(productionDiagnostics(smelter).limits.ore>0,'Ore should be identified');
  s.edges=[];
  smelter.buffer.ore=30;
  simulate(s,catalog,2);
  assert.ok(productionDiagnostics(smelter).limits.power>0,'Disconnected grid should be identified');
  s.edges=[{id:'p',from:'n1',to:'sm',resource:'power'}];
  smelter.buffer.metal=120;
  simulate(s,catalog,2);
  assert.ok(productionDiagnostics(smelter).limits.storage>0,'Full output should be identified');
});
test('measured production equals catalog rate for a fully powered, fed assembly line',()=>{
  const s=defaultState(),node=makeNode('assembly','assembler',450,170);
  s.nodes.push(node);s.edges.push({id:'p1',from:'n1',to:'assembly',resource:'power'});
  node.buffer.parts=100;node.buffer.circuits=100;
  simulate(s,catalog,5);
  assert.equal(maxProductionRate(s,node,catalog),0.5);
  assert.ok(Math.abs(productionActivity(node).rate-0.5)<1e-8);
});
