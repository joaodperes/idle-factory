import {talentModifier} from './talents.js';
/** Rolling customer orders. Deadlines count active play only; offline catch-up never expires contracts. */
const MAX_ACTIVE=3;
export function contractCapacity(state){return MAX_ACTIVE+Math.max(0,Math.floor(talentModifier(state,'contractSlots')));}
export function availableStock(state,resource){
 return state.nodes.filter(n=>n.kind==='market'||n.kind==='warehouse').reduce((total,n)=>total+(n.buffer[resource]||0),0);
}
/** Physical goods assigned to a live order are no longer available to machines or sales.
 * Earliest deadlines receive goods first, so two offers cannot count the same stock twice. */
export function reserveStoredResource(state,node,resource){
 if((node.kind!=='market'&&node.kind!=='warehouse')||state.autoSell?.[resource])return;
 let available=Math.max(0,node.buffer[resource]||0);
 if(available<=0)return;
 const orders=(state.orders||[]).filter(o=>o.resource===resource&&o.expiresAt>(state.orderClock||0))
   .sort((a,b)=>a.expiresAt-b.expiresAt||a.id.localeCompare(b.id));
 for(const order of orders){
  const missing=Math.max(0,order.amount-(order.reserved||0));
  const qty=Math.min(available,missing);
  if(qty<=0)continue;
  order.reserved=(order.reserved||0)+qty;
  node.buffer[resource]-=qty;
  available-=qty;
  if(available<=1e-8)break;
 }
}
/** Capture existing warehouse/terminal inventory when an order arrives or auto-sale is turned off. */
export function reserveStoredStock(state){
 if(!state.orders?.length)return;
 for(const node of state.nodes){
  if(node.kind!=='market'&&node.kind!=='warehouse')continue;
  for(const resource of Object.keys(node.buffer))reserveStoredResource(state,node,resource);
 }
}
/** Expired orders release their unsold goods to normal inventory instead of deleting them. */
function returnExpiredStock(state,order){
 const qty=Math.max(0,order.reserved||0);
 if(qty<=0)return;
 const node=state.nodes.find(n=>n.kind==='warehouse'||n.kind==='market');
 if(node)node.buffer[order.resource]=(node.buffer[order.resource]||0)+qty;
 order.reserved=0;
}
export function initializeOrders(state){
 if(!Array.isArray(state.orders))state.orders=[];
 if(!state.orderStats)state.orderStats={fulfilled:0,expired:0};
 if(!Number.isFinite(state.nextOrderAt))state.nextOrderAt=0;
 if(!Number.isFinite(state.orderClock))state.orderClock=0;
 if(!Number.isFinite(state.orderSerial))state.orderSerial=1;
}
function offers(state,catalog){
 const unlocked=catalog.contracts.filter(c=>{
  const threshold=c.resource==='metal'?0:c.resource==='parts'?300:c.resource==='circuits'?950:2000;
  return state.runRevenue>=threshold;
 });
 return unlocked.length?unlocked:[catalog.contracts[0]];
}
export function tickOrders(state,catalog,dt){
 initializeOrders(state);
 if(dt<=0)return;
 state.orderClock+=dt;
 const now=state.orderClock;
 const retained=[];
 for(const order of state.orders){
  if(order.expiresAt<=now){returnExpiredStock(state,order);state.orderStats.expired++;continue;}
  retained.push(order);
 }
 state.orders=retained;
 if(state.nextOrderAt>now||state.orders.length>=contractCapacity(state))return;
 const pool=offers(state,catalog);
 const template=pool[Math.floor(state.orderSerial*1.61803398875)%pool.length];
 const scaling=Math.min(2.25,1+Math.floor(state.runRevenue/12000)*0.12);
 const amount=Math.max(2,Math.ceil(template.amount*scaling*(0.7+(state.orderSerial%4)*0.12)));
 const seconds=Math.round((template.resource==='metal'?240:template.resource==='parts'?270:300)*(1+Math.min(0.4,talentModifier(state,'contractTime'))));
 const reward=Math.round(template.reward*4*(0.8+(state.orderSerial%3)*0.25)*scaling);
 const order={id:'order-'+state.orderSerial++,templateId:template.id,resource:template.resource,amount,reward,xp:template.xp*3,createdAt:now,expiresAt:now+seconds,reserved:0};
 state.orders.push(order);
 state.nextOrderAt=now+Math.max(25,75-Math.min(35,talentModifier(state,'contractFrequency')));
}
export function fulfillOrder(state,catalog,id,earn){
 initializeOrders(state);
 const order=state.orders.find(o=>o.id===id);
 if(!order)return 'This order has expired or is no longer available';
 if(order.expiresAt<=state.orderClock)return 'Order expired';
 // A manual click can reserve already-stocked goods without waiting for the next tick.
 reserveStoredStock(state);
 if((order.reserved||0)+1e-7<order.amount)return 'Not enough reserved '+catalog.resources[order.resource]?.name;
 const multiplier=1+talentModifier(state,'contracts');
 earn(state,order.reward*multiplier,order.xp);
 state.orders=state.orders.filter(o=>o.id!==id);
 state.orderStats.fulfilled++;
 state.runContracts++;
 state.contractsFilled++;
 state.nextOrderAt=Math.min(state.nextOrderAt,state.orderClock+20);
 return null;
}
