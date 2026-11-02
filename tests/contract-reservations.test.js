import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,makeNode,sanitizeSave} from '../src/core/state.js';
import {simulate,completeContract,marketQuantity,sell} from '../src/core/engine.js';

const catalog={};
for(const id of ['facilities','resources','talents','research','contracts','investments'])
  catalog[id]=JSON.parse(readFileSync(new URL('../data/catalog/'+id+'.json',import.meta.url),'utf8'));

function makeOrder(id,amount,expiresAt=60){
  return {id,templateId:'foundations',resource:'metal',amount,reward:300,xp:10,createdAt:0,expiresAt,reserved:0};
}
function storedMetal(quantity){
  const state=defaultState();
  state.onboarding=true;
  state.nextOrderAt=1e9; // Keep new offers out of the deterministic test.
  state.autoSell.metal=false;
  const store=makeNode('store','warehouse',600,300);
  const consumer=makeNode('consumer','press',800,300);
  store.buffer.metal=quantity;
  state.nodes.push(store,consumer);
  state.edges.push({id:'warehouse-route',from:store.id,to:consumer.id,resource:'metal'});
  return {state,store,consumer};
}

test('contract progress remains monotonic even when warehouse inventory feeds another machine',()=>{
  const {state,store}=storedMetal(8);
  state.orders=[makeOrder('order-1',12)];
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,8);
  assert.equal(store.buffer.metal,0,'Reserved goods must no longer enter a downstream route');
  store.buffer.metal=4;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,12);
  simulate(state,catalog,10);
  assert.equal(state.orders[0].reserved,12,'Progress must not fall as the factory runs');
  const before=state.credits;
  assert.equal(completeContract(state,catalog,'order-1'),null);
  assert.ok(state.credits>=before+300);
  assert.equal(state.orderStats.fulfilled,1);
});

test('multiple active orders cannot claim the same goods; earliest deadline takes priority',()=>{
  const {state,store}=storedMetal(12);
  state.orders=[makeOrder('order-1',8,60),makeOrder('order-2',6,20)];
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,6);
  assert.equal(state.orders[1].reserved,6);
  assert.equal(store.buffer.metal,0);
  assert.equal(state.orders.reduce((n,order)=>n+order.reserved,0),12);
});

test('expired orders return their reserved goods to inventory',()=>{
  const {state,store}=storedMetal(5);
  state.edges=[]; // Returned goods stay in a warehouse rather than routing to the consumer.
  state.orders=[makeOrder('order-1',10,3)];
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,5);
  assert.equal(marketQuantity(state,'metal'),0);
  simulate(state,catalog,3);
  assert.equal(state.orders.length,0);
  assert.equal(state.orderStats.expired,1);
  assert.equal(marketQuantity(state,'metal'),5,'Expiry must not destroy paid-for inventory');
});

test('Auto Sell ON reserves contract stock first and sells only the excess',()=>{
  const {state,store}=storedMetal(5);
  state.edges=[]; // Avoid routing surplus to an unrelated production machine.
  state.orders=[makeOrder('order-1',10)];
  state.autoSell.metal=true;
  const startingCredits=state.credits;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,5,'Auto Sell must not prevent active order progress');
  assert.equal(marketQuantity(state,'metal'),0);
  assert.equal(state.credits,startingCredits,'No stock is excess before the order is filled');
  store.buffer.metal=7;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,10,'Required goods stay protected');
  assert.equal(marketQuantity(state,'metal'),0);
  assert.ok(state.credits>startingCredits,'The two excess units should be sold automatically');
  const revenue=state.runRevenue;
  state.autoSell.metal=false;
  store.buffer.metal=3;
  simulate(state,catalog,1);
  assert.equal(marketQuantity(state,'metal'),3,'With Auto Sell OFF, excess remains stored');
  assert.equal(state.runRevenue,revenue);
  state.autoSell.metal=true;
  simulate(state,catalog,1);
  assert.equal(marketQuantity(state,'metal'),0);
  assert.equal(state.orders[0].reserved,10,'Toggling Auto Sell must not affect secured goods');
  assert.ok(state.runRevenue>revenue);
});

test('warehouse protects contract quantity and sends the surplus to a Trade Terminal',()=>{
  const {state,store}=storedMetal(9);
  const terminal=makeNode('terminal','market',1200,300);
  state.nodes.push(terminal);
  state.edges=[{id:'sell-excess',from:store.id,to:terminal.id,resource:'metal'}];
  state.orders=[makeOrder('order-1',6)];
  state.autoSell.metal=true;
  const startingCredits=state.credits;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,6);
  assert.equal(store.buffer.metal,0);
  assert.equal(terminal.buffer.metal||0,0);
  assert.ok(state.credits>startingCredits,'Only excess warehouse goods should be sold');
  const revenue=state.runRevenue;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,6,'Warehouse reservations never regress');
  assert.equal(state.runRevenue,revenue,'No new goods means no extra sales');
});

test('earliest-deadline contracts receive goods before any automated sale',()=>{
  const {state}=storedMetal(20);
  state.edges=[];
  state.orders=[makeOrder('order-1',8,60),makeOrder('order-2',6,20)];
  state.autoSell.metal=true;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,8);
  assert.equal(state.orders[1].reserved,6);
  assert.equal(marketQuantity(state,'metal'),0);
  assert.ok(state.runRevenue>0,'Six surplus units must be sold');
});

test('manual Sell also reserves contract requirements before liquidating surplus',()=>{
  const {state}=storedMetal(12);
  state.edges=[];
  state.orders=[makeOrder('order-1',8)];
  const sold=sell(state,catalog,'metal',Infinity);
  assert.equal(state.orders[0].reserved,8);
  assert.equal(sold,4);
  assert.equal(marketQuantity(state,'metal'),0);
});

test('Trade Terminals can reserve contracts without a warehouse in the early game',()=>{
  const {state,store}=storedMetal(6);
  store.kind='market';
  state.edges=[];
  state.orders=[makeOrder('order-1',4)];
  state.autoSell.metal=true;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,4);
  assert.ok(state.runRevenue>0,'Terminal sells excess as usual');
});

test('contract reservations survive save import and cannot exceed the requested amount',()=>{
  const {state}=storedMetal(0);
  state.orders=[makeOrder('order-1',10)];
  state.orders[0].reserved=7;
  const restored=sanitizeSave(JSON.parse(JSON.stringify(state)),catalog);
  assert.equal(restored.orders[0].reserved,7);
  state.orders[0].reserved=1000;
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(state)),catalog).orders[0].reserved,10);
  delete state.orders[0].reserved; // Existing saves have no reservation field.
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(state)),catalog).orders[0].reserved,0);
});
