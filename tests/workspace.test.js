import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,sanitizeSave} from '../src/core/state.js';
import {addFacility,moveFacility} from '../src/core/graph.js';
import {expandedWorkspace,INITIAL_CANVAS_WIDTH,INITIAL_CANVAS_HEIGHT} from '../src/core/workspace.js';
import {routeConnection,routePath} from '../src/core/router.js';

const json=name=>JSON.parse(readFileSync(new URL(`../data/catalog/${name}.json`,import.meta.url),'utf8'));
const catalog={facilities:json('facilities'),resources:json('resources'),
  research:json('research'),investments:json('investments'),talents:json('talents'),contracts:json('contracts')};

test('machines can be moved and built beyond original map',()=>{
  const s=defaultState();s.credits=50000;
  moveFacility(s,'n2',5800,4300);
  assert.deepEqual([s.nodes[1].x,s.nodes[1].y],[5800,4300]);
  assert.equal(addFacility(s,catalog,'mine',8800,6700),null);
  assert.deepEqual([s.nodes.at(-1).x,s.nodes.at(-1).y],[8800,6700]);
});

test('workspace grows to hold distant machines and does not snap back',()=>{
  const initial=expandedWorkspace([]);
  assert.deepEqual(initial,{width:INITIAL_CANVAS_WIDTH,height:INITIAL_CANVAS_HEIGHT});
  const big=expandedWorkspace([{x:8200,y:4100}],0,0,initial);
  assert.ok(big.width>=8200+207+450);
  assert.ok(big.height>=4100+180+450);
  assert.deepEqual(expandedWorkspace([],0,0,big),big);
});

test('distant machines and blueprints survive save normalization',()=>{
  const s=defaultState();moveFacility(s,'n2',9200,7600);
  s.layouts=[{name:'Long factory',nodes:[{id:'n2',kind:'mine',x:12000,y:9500}],edges:[]}];
  const restored=sanitizeSave(JSON.parse(JSON.stringify(s)),catalog);
  assert.deepEqual([restored.nodes[1].x,restored.nodes[1].y],[9200,7600]);
  assert.deepEqual([restored.layouts[0].nodes[0].x,restored.layouts[0].nodes[0].y],[12000,9500]);
});

test('routes between distant machines no longer stop at legacy canvas',()=>{
  const from={x:6110,y:4000},to={x:8700,y:4900};
  const boxes=[{x:5880,y:3910,width:207,height:158},{x:8725,y:4810,width:207,height:158}];
  const points=routeConnection(from,to,boxes);
  assert.ok(points.length>=2);
  assert.deepEqual(points[0],from);
  assert.deepEqual(points.at(-1),to);
  assert.ok(routePath(points).startsWith('M'));
});
