import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,makeNode} from '../src/core/state.js';
import {buyResearch,publishResearch,resetCompany} from '../src/core/actions.js';
import {factoryLevel,talentStatus} from '../src/core/talents.js';
import {generatorOutput,simulate,contractAvailable,completeContract} from '../src/core/engine.js';
import {researchLicensingCost,researchLicensingReward,researchModifier,researchStatus} from '../src/core/research.js';
import {buildHudMetrics,renderHudHtml} from '../src/core/hud.js';
const catalog={};
for(const name of ['facilities','resources','research','talents','investments','contracts']){
  catalog[name]=JSON.parse(readFileSync(new URL('../data/catalog/'+name+'.json',import.meta.url),'utf8'));
}
test('18 researched technologies are in ascending price order with prerequisites',()=>{
  const arr=Object.values(catalog.research);
  assert.equal(arr.length,18);
  assert.ok(arr.every((item,i)=>i===0||item.cost>=arr[i-1].cost));
  assert.ok(arr.some(item=>item.tier===6&&item.requires.length));
});
test('talent tiers are gated by points, not an arbitrary higher factory level',()=>{
  const s=defaultState();s.xp=60*11*11;
  assert.equal(factoryLevel(s),12);
  s.talents={precision:3,lean:2,yield_mastery:2};
  assert.equal(talentStatus(s,catalog,'adaptive_control').enabled,true);
});
test('research requires its predecessor and consumes R&D data',()=>{
  const s=defaultState();s.data=1000;
  assert.equal(researchStatus(s,catalog,'robotics').ready,false);
  assert.match(buyResearch(s,catalog,'robotics'),/Requires/);
  assert.equal(buyResearch(s,catalog,'logistics'),null);
  assert.equal(s.data,988);
  assert.ok(researchModifier({...s,research:{logistics:true}},'routing')>0);
});
test('after six technologies, licensing converts surplus R&D to credits and XP indefinitely',()=>{
  const s=defaultState();
  Object.keys(catalog.research).slice(0,6).forEach(id=>s.research[id]=true);
  s.data=1000;
  const cost=researchLicensingCost(s),reward=researchLicensingReward(s);
  const before=s.credits,oldXp=s.xp;
  assert.equal(publishResearch(s,catalog),null);
  assert.equal(s.researchLicenses,1);
  assert.equal(s.data,1000-cost);
  assert.ok(Math.abs(s.credits-before-reward)<0.0001);
  assert.ok(s.xp>oldXp);
  assert.ok(researchLicensingCost(s)>cost);
  assert.equal(publishResearch(s,catalog),null);
});
test('solar has higher power density and level scaling than the starter station',()=>{
  const s=defaultState();
  const station=makeNode('g','generator',1,1),solar=makeNode('s','solar',1,1);
  assert.equal(generatorOutput(s,station,catalog),12);
  assert.equal(generatorOutput(s,solar,catalog),30);
  station.level=2;solar.level=2;
  assert.equal(generatorOutput(s,station,catalog),18);
  assert.equal(generatorOutput(s,solar,catalog),60);
  s.research.solar_cells=true;
  assert.equal(generatorOutput(s,solar,catalog),90);
});
test('all sellable materials can automatically sell without automation talents',()=>{
  const s=defaultState();
  const terminal=makeNode('market','market',500,220);
  terminal.buffer.parts=25;s.nodes.push(terminal);
  s.autoSell.parts=true;
  const before=s.credits;
  simulate(s,catalog,1);
  assert.equal(terminal.buffer.parts,0);
  assert.ok(s.credits>before);
});
test('contracts can be completed once per UTC day, not every two minutes',()=>{
  const s=defaultState(),terminal=makeNode('market','market',500,220);
  s.nodes.push(terminal);terminal.buffer.metal=100;
  const contract=catalog.contracts.find(c=>c.id==='foundations');
  assert.equal(contractAvailable(s,contract),true);
  assert.equal(completeContract(s,catalog,'foundations'),null);
  assert.equal(contractAvailable(s,contract),false);
  simulate(s,catalog,125);
  assert.equal(contractAvailable(s,contract),false);
  s.dailyContracts.foundations='2000-01-01';
  assert.equal(contractAvailable(s,contract),true);
});
test('header power alert opens affected grid rather than being an inert label',()=>{
  const s=defaultState(),machine=makeNode('isolated','smelter',500,500);
  s.nodes.push(machine);
  const grid={supply:12,demand:2,groups:new Map([['x',{supply:12,demand:1,nodes:['n1','n2']}],['y',{supply:0,demand:1,nodes:['isolated']}]])};
  const metrics=buildHudMetrics(s,catalog,grid,{fmt:String,money:String,tutorial:false});
  assert.equal(metrics.find(m=>m.action==='power-alert')?.warning,true);
  assert.match(renderHudHtml(metrics),/data-action="power-alert"/);
});
