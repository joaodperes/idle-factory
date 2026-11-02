import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,operatingGraph} from '../src/core/state.js';
import {simulate,sell,marketActivity,marketQuantity} from '../src/core/engine.js';
import {advanceTutorial} from '../src/core/tutorial.js';

const catalog={
  facilities:JSON.parse(readFileSync(new URL('../data/catalog/facilities.json',import.meta.url),'utf8')),
  resources:JSON.parse(readFileSync(new URL('../data/catalog/resources.json',import.meta.url),'utf8'))
};
function operatingState(){
  const state=defaultState();
  const graph=operatingGraph();
  state.nodes=graph.nodes;
  state.edges=graph.edges;
  state.nextId=5;
  return state;
}

test('connected smelter auto-sells metal and generates revenue despite zero terminal inventory',()=>{
  const state=operatingState();
  simulate(state,catalog,8);
  const terminal=state.nodes.find(n=>n.kind==='market');
  assert.ok(state.runRevenue>0,'The terminal should generate revenue');
  assert.ok(state.credits>900,'Credits should increase after selling metal');
  assert.equal(marketQuantity(state,'metal'),0,'Auto-selling should empty terminal inventory');
  assert.ok(marketActivity(terminal).units>0,'The terminal should expose recent sales');
  assert.ok(marketActivity(terminal).revenue>0,'Recent sales should include earned credits');
});

test('the tutorial completes its sale step when simulated revenue becomes positive',()=>{
  const state=operatingState();
  state.tutorialStep=6;
  simulate(state,catalog,8);
  assert.equal(advanceTutorial(state),true);
  assert.equal(state.tutorialStep,7);
});

test('no ore delivery means no metal revenue',()=>{
  const state=operatingState();
  state.edges=state.edges.filter(e=>e.resource!=='ore');
  simulate(state,catalog,8);
  assert.equal(state.runRevenue,0);
  assert.equal(marketActivity(state.nodes.find(n=>n.kind==='market')).units,0);
});

test('manual selling also reports the terminal sale and empties its stock',()=>{
  const state=operatingState();
  state.autoSell.metal=false;
  simulate(state,catalog,8);
  const terminal=state.nodes.find(n=>n.kind==='market');
  const quantity=marketQuantity(state,'metal');
  assert.ok(quantity>0);
  assert.equal(state.runRevenue,0);
  const sold=sell(state,catalog,'metal',quantity);
  assert.equal(sold,quantity);
  assert.equal(marketQuantity(state,'metal'),0);
  assert.ok(marketActivity(terminal).revenue>0);
});
