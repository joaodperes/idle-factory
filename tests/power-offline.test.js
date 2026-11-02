import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,operatingGraph} from '../src/core/state.js';
import {gridStatus,simulate} from '../src/core/engine.js';

const catalog={
  facilities:JSON.parse(readFileSync(new URL('../data/catalog/facilities.json',import.meta.url),'utf8')),
  resources:JSON.parse(readFileSync(new URL('../data/catalog/resources.json',import.meta.url),'utf8'))
};
const factory=()=>{
  const state=defaultState();
  const graph=operatingGraph();
  state.nodes=graph.nodes;state.edges=graph.edges;
  return state;
};

test('connected 12 generated / 3 consumed means spare power and full efficiency',()=>{
  const state=factory(),g=gridStatus(state,catalog);
  assert.equal(g.supply,12);
  assert.equal(g.demand,3);
  assert.ok([...g.efficiency.values()].every(r=>r===1));
});

test('aggregate power can be sufficient while an isolated consumer is underpowered',()=>{
  const state=factory();
  state.edges=state.edges.filter(edge=>edge.resource!=='power' || edge.to!=='n3');
  const g=gridStatus(state,catalog);
  assert.ok(g.supply>g.demand);
  assert.ok([...g.groups.values()].some(group=>group.demand>group.supply));
  assert.equal(g.efficiency.get('n3'),0);
});

test('offline production earns revenue at reduced efficiency',()=>{
  const online=factory(),offline=factory();
  simulate(online,catalog,120);
  simulate(offline,catalog,120,{offline:true});
  assert.ok(offline.runRevenue>0);
  assert.ok(online.runRevenue>offline.runRevenue);
  assert.equal(offline.elapsed,120);
});

test('offline catch-up cannot exceed eight hours in one simulation call',()=>{
  const state=factory();
  simulate(state,catalog,9*3600,{offline:true});
  assert.equal(state.elapsed,8*3600);
});
