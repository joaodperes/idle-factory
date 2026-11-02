import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultState,makeNode,sanitizeSave} from '../src/core/state.js';
import {simulate,completeContract,marketQuantity,sell,capacity,WAREHOUSE_TRADE_SPEED} from '../src/core/engine.js';
import {availableStock} from '../src/core/orders.js';

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
  assert.equal(availableStock(state,'metal'),5,'Expiry must not destroy paid-for inventory');
  assert.equal(marketQuantity(state,'metal'),0,'Warehouse inventory is not direct-sale inventory');
});

test('Auto Sell ON reserves contracts first, but cannot sell unconnected warehouse inventory',()=>{
  const {state,store}=storedMetal(5);
  state.edges=[];
  state.orders=[makeOrder('order-1',10)];
  state.autoSell.metal=true;
  const startingCredits=state.credits;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,5,'Auto Sell must not prevent contract progress');
  assert.equal(state.credits,startingCredits,'Warehoused materials cannot sell without a terminal link');
  store.buffer.metal=7;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,10);
  assert.equal(availableStock(state,'metal'),2,'The leftover metal remains stored');
  assert.equal(marketQuantity(state,'metal'),0);
  state.autoSell.metal=false;
  store.buffer.metal=3;
  simulate(state,catalog,1);
  assert.equal(availableStock(state,'metal'),3);
  assert.equal(state.credits,startingCredits);
  state.autoSell.metal=true;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,10,'Auto Sell cannot erase reserved stock');
  assert.equal(availableStock(state,'metal'),3,'Stock remains held until a full buffer can dispatch');
});

test('warehouse protects contract goods and dispatches only from a full buffer',()=>{
  const {state,store}=storedMetal(9);
  const terminal=makeNode('terminal','market',1200,300);
  state.nodes.push(terminal);
  state.edges=[{id:'sell-excess',from:store.id,to:terminal.id,resource:'metal'}];
  state.orders=[makeOrder('order-1',6)];
  state.autoSell.metal=true;
  const startingCredits=state.credits;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,6);
  assert.equal(store.buffer.metal,3,'Unreserved goods stay warehoused');
  assert.equal(state.runRevenue,0,'Below-capacity stock must not auto-sell');
  store.buffer.metal=capacity(state,store);
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,6,'Reserved contract progress is unaffected');
  assert.ok(state.credits>startingCredits,'Full warehouse starts forwarding surplus');
  assert.ok(Math.abs(store.buffer.metal-(capacity(state,store)-3*WAREHOUSE_TRADE_SPEED))<1e-7);
  assert.equal(terminal.buffer.metal||0,0,'Terminal sells immediately with Auto Sell ON');
  const revenue=state.runRevenue;
  simulate(state,catalog,1);
  assert.equal(state.runRevenue,revenue,'Warehouse stops forwarding if it is no longer full');
});

test('earliest-deadline contracts reserve stock before it may be dispatched',()=>{
  const {state}=storedMetal(20);
  state.edges=[];
  state.orders=[makeOrder('order-1',8,60),makeOrder('order-2',6,20)];
  state.autoSell.metal=true;
  simulate(state,catalog,1);
  assert.equal(state.orders[0].reserved,8);
  assert.equal(state.orders[1].reserved,6);
  assert.equal(availableStock(state,'metal'),6,'The remaining inventory stays in warehouse');
  assert.equal(marketQuantity(state,'metal'),0);
  assert.equal(state.runRevenue,0);
});

test('manual selling only liquidates terminal stock; warehouse goods remain protected',()=>{
  const {state,store}=storedMetal(12);
  state.edges=[];
  state.orders=[makeOrder('order-1',8)];
  const terminal=makeNode('terminal','market',1200,300);
  terminal.buffer.metal=4;
  state.nodes.push(terminal);
  const sold=sell(state,catalog,'metal',Infinity);
  assert.equal(state.orders[0].reserved,8);
  assert.equal(sold,4,'Manual Sell must only draw from the Trade Terminal');
  assert.equal(store.buffer.metal,4);
  assert.equal(marketQuantity(state,'metal'),0);
  assert.equal(availableStock(state,'metal'),4);
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

test('warehouse overflow to terminal waits for each resource to fill and is slower than direct sales',()=>{
  const {state,store}=storedMetal(0);
  const terminal=makeNode('terminal','market',1200,300);
  state.nodes.push(terminal);
  state.edges=[{id:'sell-excess',from:store.id,to:terminal.id,resource:'metal'}];
  state.autoSell.metal=true;
  store.buffer.metal=capacity(state,store)-1;
  const initial=state.credits;
  simulate(state,catalog,1);
  assert.equal(state.credits,initial);
  assert.equal(store.buffer.metal,capacity(state,store)-1);
  store.buffer.metal=capacity(state,store);
  simulate(state,catalog,1);
  const revenue=state.runRevenue;
  assert.ok(revenue>0,'Full warehouse must sell through its linked terminal');
  assert.ok(Math.abs(3*WAREHOUSE_TRADE_SPEED-(capacity(state,store)-store.buffer.metal))<1e-7);
  const direct=defaultState();
  const directTerminal=makeNode('direct-terminal','market',1200,300);
  directTerminal.buffer.metal=3;
  direct.nodes.push(directTerminal);
  direct.autoSell.metal=true;
  simulate(direct,catalog,1);
  assert.ok(direct.runRevenue>revenue,'Direct selling moves more goods per tick than warehouse dispatch');
});
test('warehouse overflow works regardless of the order in which links were created',()=>{
  const {state,store}=storedMetal(0);
  const source=makeNode('source','smelter',300,300),terminal=makeNode('terminal','market',1200,300);
  source.buffer.metal=3;
  state.nodes.push(source,terminal);
  // Intentionally put the outgoing edge first.
  state.edges=[{id:'out',from:store.id,to:terminal.id,resource:'metal'},
    {id:'in',from:source.id,to:store.id,resource:'metal'}];
  store.buffer.metal=capacity(state,store)-1;
  state.autoSell.metal=true;
  simulate(state,catalog,1);
  assert.ok(state.runRevenue>0,'Incoming producers must fill the buffer before overflow ships');
});
