import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,makeNode} from '../src/core/state.js';
import {canConnect,totalSlots} from '../src/core/graph.js';
import {simulate,capacity,marketQuantity,completeContract} from '../src/core/engine.js';
import {factoryLevel,nextFactoryLevelXp,talentStatus,currentCareer,pointsEarned} from '../src/core/talents.js';
import {buyTalent} from '../src/core/actions.js';
import {researchStatus} from '../src/core/research.js';

const catalog={};
for(const id of ['facilities','resources','talents','research','contracts','investments'])
  catalog[id]=JSON.parse(readFileSync(new URL('../data/catalog/'+id+'.json',import.meta.url),'utf8'));

test('career levels grow geometrically; there are not enough levels to max all three careers',()=>{
 const low={...defaultState(),xp:1509},high={...defaultState(),xp:461383};
 assert.equal(factoryLevel(low),10);
 assert.equal(factoryLevel(high),54);
 assert.equal(pointsEarned(high),50);
 assert.ok(nextFactoryLevelXp({xp:80000})-80000>nextFactoryLevelXp({xp:1400})-1400);
 assert.ok(pointsEarned({xp:1e12})<3*55);
});
test('a first career locks others until its 50th point buys the capstone',()=>{
 const s=defaultState();s.xp=1e10;
 assert.equal(buyTalent(s,catalog,'engineer_t1_c2'),null);
 assert.equal(currentCareer(s,catalog),'engineer');
 assert.match(buyTalent(s,catalog,'scientist_t1_c1'),/Finish/);
 const nodes=catalog.talents.engineer.nodes.filter(n=>!n.capstone);
 for(let tier=1;tier<=9;tier++)s.talents['engineer_t'+tier+'_c2']=1;
 let used=9;
 for(const n of nodes){while((s.talents[n.id]||0)<n.max&&used<49){s.talents[n.id]=(s.talents[n.id]||0)+1;used++;}}
 assert.equal(used,49);
 assert.equal(talentStatus(s,catalog,'engineer_capstone').enabled,true);
 assert.equal(buyTalent(s,catalog,'engineer_capstone'),null);
 assert.ok(s.completedCareers.includes('engineer'));
 assert.equal(buyTalent(s,catalog,'scientist_t1_c1'),null);
 assert.match(buyTalent(s,catalog,'business_t1_c1'),/Finish/);
});
test('warehouses reserve every resource and allow production routing',()=>{
 const s=defaultState(),warehouse=makeNode('store','warehouse',600,300);
 s.nodes.push(warehouse);
 assert.equal(canConnect(s,catalog,'n2','store','ore'),null);
 assert.equal(capacity(s,warehouse),600);
 s.edges.push({id:'p1',from:'n1',to:'n2',resource:'power'},{id:'m1',from:'n2',to:'store',resource:'ore'});
 s.onboarding=true;simulate(s,catalog,8);
 assert.ok(warehouse.buffer.ore>0);
 assert.equal(marketQuantity(s,'ore'),warehouse.buffer.ore);
});
test('contracts spawn and expire during play but not while offline',()=>{
 const s=defaultState();s.onboarding=true;
 simulate(s,catalog,2);
 assert.equal(s.orders.length,1);
 const pending=s.orders[0],before=s.orderClock;
 simulate(s,catalog,300,{offline:true});
 assert.equal(s.orderClock,before);
 assert.ok(s.orders.find(o=>o.id===pending.id));
 simulate(s,catalog,260);
 assert.ok(s.orderStats.expired>=1);
 assert.equal(s.orders.some(o=>o.id===pending.id),false);
});
test('customer orders pay high bonuses when filled before their expiry',()=>{
 const s=defaultState();s.onboarding=true;
 simulate(s,catalog,2);
 const order=s.orders[0],stock=makeNode('warehouse','warehouse',500,200);
 s.nodes.push(stock);stock.buffer[order.resource]=order.amount;
 s.autoSell[order.resource]=false;
 const before=s.credits;
 assert.equal(completeContract(s,catalog,order.id),null);
 assert.ok(s.credits-before>=order.reward);
 assert.equal(s.orderStats.fulfilled,1);
 assert.equal(s.orders.length,0);
});
test('scientists can reunite exclusive research branches late in their career',()=>{
 const s=defaultState();s.data=50000;
 for(const id of ['logistics','market','energy','yield','supply_ai','robotics'])s.research[id]=true;
 assert.match(researchStatus(s,catalog,'offline').reason,/Conflicts/);
 s.talents.scientist_t8_c2=1;
 assert.equal(researchStatus(s,catalog,'offline').ready,true);
});
test('career-exclusive facilities are locked until their corresponding talent is learned',()=>{
 const s=defaultState();s.credits=1e6;s.runRevenue=1e6;
 assert.match(canConnect(s,catalog,'n2','n1','power'),/Only Power Stations/);
 assert.ok(catalog.facilities.fusion.talentUnlock);
 assert.ok(catalog.facilities.quantumlab.talentUnlock);
 assert.equal(totalSlots(s),26);
});
