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

test('new players have no selected specialization, no talent points and a locked tree',()=>{
  const s=defaultState();
  assert.equal(s.specialization,null);
  assert.equal(factoryLevel(s),1);
  assert.equal(pointsEarned(s),0);
  assert.equal(freeTalentPoints(s),0);
  assert.match(talentStatus(s,catalog,'lean').reason,/Level 5/);
});
test('factory levels unlock talents at level five and increase global capacity every third level',()=>{
  const s=defaultState();
  assert.equal(totalSlots(s),26);
  s.xp=540;assert.equal(factoryLevel(s),4);
  assert.equal(totalSlots(s),28);
  s.xp=960;assert.equal(factoryLevel(s),5);
  assert.equal(pointsEarned(s),1);
  assert.equal(talentStatus(s,catalog,'lean').enabled,true);
  assert.equal(buyTalent(s,catalog,'lean'),null);
  assert.equal(freeTalentPoints(s),0);
});
test('talent tiers require earlier linked nodes and points invested in their tree',()=>{
  const s=advanced(60*8**2);
  s.talents={precision:3};
  assert.equal(talentStatus(s,catalog,'yield_mastery').enabled,true);
  assert.match(buyTalent({...s,talents:{grid:3}},catalog,'yield_mastery'),/linked/);
  assert.match(buyTalent({...s,talents:{precision:1}},catalog,'yield_mastery'),/Spend/);
});
test('branches are not mutually exclusive but their late doctrine choices are',()=>{
  const s=advanced();
  s.talents={precision:3,lean:3,grid:3,recycling:2,yield_mastery:2,adaptive_control:2,eco_mode:1,pricing:1};
  assert.ok(talentModifier(s,'pricing')>0);
  assert.ok(talentModifier(s,'inputSavings')>0);
  assert.match(buyTalent(s,catalog,'turbo_mode'),/Mutually exclusive/);
});
test('respec refunds all points without changing user auto-sale settings',()=>{
  const s=advanced();s.talents={lean:2,precision:2,automation:1};s.autoSell={metal:true,parts:true};
  assert.equal(respecTalents(s),null);
  assert.equal(freeTalentPoints(s),pointsEarned(s));
  assert.equal(s.autoSell.parts,true);
});
test('legacy specialization saves preserve earlier investments and convert relayed electricity',()=>{
  const original=operating();
  const smelter=original.nodes.find(n=>n.kind==='smelter');
  const mine=original.nodes.find(n=>n.kind==='mine');
  original.edges=original.edges.filter(e=>e.resource!=='power');
  original.edges.push({id:'e8',from:'n1',to:mine.id,resource:'power'},{id:'e9',from:mine.id,to:smelter.id,resource:'power'});
  original.talents={precision:2,lean:1};original.specialization='engineer';
  const restored=sanitizeSave({...original,version:3},catalog);
  assert.equal(restored.specialization,null);
  assert.equal(restored.talents.precision,2);
  assert.ok(restored.edges.some(e=>e.from==='n1'&&e.to===smelter.id&&e.resource==='power'));
  assert.equal(restored.edges.filter(e=>e.resource==='power').every(e=>catalog.facilities[restored.nodes.find(n=>n.id===e.from).kind].power>0),true);
});
test('power connections originate only from generators, despite legacy relays',()=>{
  const s=operating();
  assert.match(canConnect(s,catalog,'n2','n3','power'),/Only Power Stations/);
  assert.equal(canConnect(s,catalog,'n1','n3','power')?.startsWith('That link'),true);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/def\.power\?port\('out','power'/);
  assert.doesNotMatch(main,/power-relay/);
});
test('contract Local Construction needs 25 metal saved at the Trade Terminal',()=>{
  const s=operating();
  s.autoSell.metal=false;
  simulate(s,catalog,60);
  assert.ok(marketQuantity(s,'metal')>=25);
  assert.equal(completeContract(s,catalog,'foundations'),null);
  assert.equal(s.runContracts,1);
  assert.equal(catalog.contracts[0].amount,25);
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
