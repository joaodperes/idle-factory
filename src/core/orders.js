import {talentModifier} from './talents.js';
/** Rolling customer orders. Deadlines count active play only; offline catch-up never expires contracts. */
const MAX_ACTIVE=3;
export function contractCapacity(state){return MAX_ACTIVE+Math.max(0,Math.floor(talentModifier(state,'contractSlots')));}
export function availableStock(state,resource){
 return state.nodes.filter(n=>n.kind==='market'||n.kind==='warehouse').reduce((total,n)=>total+(n.buffer[resource]||0),0);
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
  if(order.expiresAt<=now){state.orderStats.expired++;continue;}
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
 const order={id:'order-'+state.orderSerial++,templateId:template.id,resource:template.resource,amount,reward,xp:template.xp*3,createdAt:now,expiresAt:now+seconds};
 state.orders.push(order);
 state.nextOrderAt=now+Math.max(25,75-Math.min(35,talentModifier(state,'contractFrequency')));
}
export function fulfillOrder(state,catalog,id,earn){
 initializeOrders(state);
 const order=state.orders.find(o=>o.id===id);
 if(!order)return 'This order has expired or is no longer available';
 if(order.expiresAt<=state.orderClock)return 'Order expired';
 if(availableStock(state,order.resource)+1e-7<order.amount)return 'Not enough reserved '+catalog.resources[order.resource]?.name;
 let remaining=order.amount;
 for(const node of state.nodes){
  if(node.kind!=='warehouse'&&node.kind!=='market')continue;
  const take=Math.min(remaining,node.buffer[order.resource]||0);
  node.buffer[order.resource]=(node.buffer[order.resource]||0)-take;
  remaining-=take;
  if(remaining<=1e-7)break;
 }
 const multiplier=1+talentModifier(state,'contracts');
 earn(state,order.reward*multiplier,order.xp);
 state.orders=state.orders.filter(o=>o.id!==id);
 state.orderStats.fulfilled++;
 state.runContracts++;
 state.contractsFilled++;
 state.nextOrderAt=Math.min(state.nextOrderAt,state.orderClock+20);
 return null;
}
