import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,makeNode} from '../src/core/state.js';
import {addFacility,canConnect,facilityLimit,nextCapacityMilestone,nodeCost,upgradeCost} from '../src/core/graph.js';
import {capacity,simulate,productionActivity,maxProductionRate,gridStatus} from '../src/core/engine.js';
import {routeConnection,routePath} from '../src/core/router.js';

const catalog={
  facilities:JSON.parse(readFileSync(new URL('../data/catalog/facilities.json',import.meta.url),'utf8')),
  resources:JSON.parse(readFileSync(new URL('../data/catalog/resources.json',import.meta.url),'utf8'))
};
test('per-kind caps unlock through run revenue and Industrial Estate; legacy overflow remains intact',()=>{
  const state=defaultState();
  assert.equal(facilityLimit(state,'assembler'),1);
  assert.equal(nextCapacityMilestone(state),5000);
  state.runRevenue=5000;
  assert.equal(facilityLimit(state,'assembler'),2);
  state.investments.infrastructure=2;
  assert.equal(facilityLimit(state,'assembler'),3);
  state.nodes.push(makeNode('legacy-extra','assembler',500,500));
  state.nodes.push(makeNode('legacy-extra2','assembler',750,500));
  assert.equal(state.nodes.filter(n=>n.kind==='assembler').length,2);
  assert.ok(state.nodes.some(n=>n.id==='legacy-extra'));
});
test('duplicate construction stops at current type limit even when global slots are free',()=>{
  const state=defaultState();
  state.credits=50000;
  assert.equal(addFacility(state,catalog,'market',500,100),null);
  assert.equal(addFacility(state,catalog,'market',800,100),null);
  assert.match(addFacility(state,catalog,'market',1100,100),/Maximum.*Trade Terminal/);
});
test('first upgrades beat duplicate construction in cost per incremental factory output',()=>{
  const state=defaultState();
  state.runRevenue=10000;
  const press=makeNode('press','press',400,400);
  const base=maxProductionRate(state,press,catalog);
  const cost=upgradeCost(press,catalog);
  const duplicateCost=nodeCost('press',{...state,nodes:[press]},catalog);
  press.level=2;
  const increase=maxProductionRate(state,press,catalog)-base;
  assert.ok(cost/increase<duplicateCost/base);
  assert.ok(capacity(state,press)>120);
});
test('power bus relays are not power generators and a terminal cannot relay a grid',()=>{
  const state=defaultState();
  state.nodes.push(makeNode('smelter','smelter',550,250));
  state.nodes.push(makeNode('market','market',850,250));
  assert.equal(canConnect(state,catalog,'n2','smelter','power'),null);
  assert.match(canConnect(state,catalog,'market','smelter','power'),/Power links/);
  const g=gridStatus(state,catalog);
  assert.equal(g.supply,12);
  state.nodes[0].level=2;
  assert.equal(gridStatus(state,catalog).supply,18);
});
test('assembly reads precise Components and Circuits input, and reports real 0.5/s output',()=>{
  const state=defaultState();
  const assembler=makeNode('assembler','assembler',550,250);
  assembler.buffer.parts=100;
  assembler.buffer.circuits=100;
  state.nodes.push(assembler);
  state.edges.push({id:'power',from:'n1',to:'assembler',resource:'power'});
  simulate(state,catalog,10);
  assert.equal(catalog.resources.parts.name,'Components');
  assert.equal(maxProductionRate(state,assembler,catalog),0.5);
  assert.ok(Math.abs(productionActivity(assembler).rate-0.5)<1e-9);
  assert.ok(assembler.buffer.devices>0);
});
test('obstacle routing stays inside canvas and outside intervening cards',()=>{
  const start={x:289,y:120},end={x:905,y:120};
  const obstruction={x:410,y:10,width:207,height:280};
  const points=routeConnection(start,end,[
    {x:82,y:20,width:207,height:158},
    obstruction,
    {x:905,y:20,width:207,height:158}
  ]);
  assert.ok(points.length>=4);
  assert.equal(points[0].x,start.x);
  assert.equal(points.at(-1).x,end.x);
  assert.ok(routePath(points).startsWith('M'));
  for(const p of points)assert.ok(p.x>=0&&p.y>=0&&p.x<=2500&&p.y<=1650);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    assert.ok(a.x===b.x||a.y===b.y,'A routed segment should be orthogonal');
    const crosses=a.x===b.x
      ?a.x>=obstruction.x&&a.x<=obstruction.x+obstruction.width&&Math.max(a.y,b.y)>=obstruction.y&&Math.min(a.y,b.y)<=obstruction.y+obstruction.height
      :a.y>=obstruction.y&&a.y<=obstruction.y+obstruction.height&&Math.max(a.x,b.x)>=obstruction.x&&Math.min(a.x,b.x)<=obstruction.x+obstruction.width;
    assert.equal(crosses,false,'The route must never pass through another factory');
  }
});
test('an input blocked by overlapping machines is flagged, never drawn through cards',()=>{
  const pts=routeConnection({x:289,y:120},{x:805,y:550},[
    {x:82,y:20,width:207,height:158},
    {x:805,y:500,width:207,height:158},
    {x:420,y:0,width:207,height:350},
    {x:630,y:300,width:150,height:350}
  ]);
  assert.deepEqual(pts,[]);
});
