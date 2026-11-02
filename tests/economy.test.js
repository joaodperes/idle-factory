import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultState, sanitize} from '../src/core/save.js';
import {computePower, computeProduction, applyPower, previewPowerEfficiency, prestigeReward} from '../src/core/economy.js';
const catalog = (name) => JSON.parse(fs.readFileSync(new URL(`../data/catalog/${name}.json`, import.meta.url),'utf8'));
const C = {BUILDINGS:catalog('buildings'),RESEARCH:catalog('research'),META:catalog('prestige'),WORKER_CLASSES:catalog('workers')};

test('catalog preserves all original definitions', () => {
  assert.equal(Object.keys(C.BUILDINGS).length, 8);
  assert.equal(Object.keys(C.RESEARCH).length, 15);
  assert.equal(Object.keys(C.META).length, 5);
  assert.equal(Object.keys(C.WORKER_CLASSES).length, 3);
});
test('a generator + assembler creates power and 1 part/s', () => {
  const state = defaultState();
  state.buildings.assembler = 1;
  assert.equal(computePower(state,C.BUILDINGS).gen, 1.5);
  assert.equal(computePower(state,C.BUILDINGS).demand, 1);
  assert.equal(computeProduction(state,C.BUILDINGS).parts, 1);
});
test('power deficit throttles, batteries cover shortfall only while charged', () => {
  const state = defaultState();
  state.power = 5;
  const power = {gen:1,demand:3,storage:40};
  assert.equal(previewPowerEfficiency(state,power,2),1);
  assert.equal(applyPower(state,power,2),1);
  assert.equal(state.power,1);
  assert.equal(applyPower(state,power,2),0.5);
  assert.equal(state.power,0);
});
test('prestige starts at 10k and grows by sqrt', () => {
  const state = defaultState();
  state.totalParts = 9999;assert.equal(prestigeReward(state),0);
  state.totalParts = 10000;assert.equal(prestigeReward(state),1);
  state.totalParts = 40000;assert.equal(prestigeReward(state),2);
});
test('invalid and hostile imports cannot overwrite catalogs or inject invalid numbers', () => {
  const state = sanitize({version:2,parts:1e309,buildings:{generator:2,notreal:999},research:{auto_eff:true,invalid:true},meta:{meta_slots:500}},C);
  assert.equal(state.parts,0);
  assert.deepEqual(state.buildings,{generator:2});
  assert.equal(state.research.auto_eff,true);
  assert.equal(state.research.invalid,undefined);
  assert.equal(state.meta.meta_slots,C.META.meta_slots.max);
  assert.throws(()=>sanitize({version:3},C));
});
