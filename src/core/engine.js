import {tickOrders,fulfillOrder,availableStock} from './orders.js';
import {researchModifier} from './research.js';
import {factoryLevel,freeTalentPoints,talentModifier} from './talents.js';
/** Deterministic discrete-time factory engine. All production flows through saved graph edges. */
const OUTPUT_LIMIT=120;
const recentMarketSales=new WeakMap();
const recentProduction=new WeakMap();
const recentDiagnostics=new WeakMap();
/** Last simulated interval: reasons a machine operated below its potential, and actual input delivery rates. */
export function productionDiagnostics(node){return recentDiagnostics.get(node)||{limits:{},received:{},consumed:{},seconds:0};}
/** Measured output during the last simulation update, not a theoretical catalog rate. */
export function productionActivity(node){return recentProduction.get(node)||{produced:0,seconds:0,rate:0};}
/** Sales made during the most recent simulation update (not cumulative inventory). */
export function marketActivity(node){return recentMarketSales.get(node)||{units:0,revenue:0};}
const BASE_LINK_RATE=3;
const bonus=(state,key)=>talentModifier(state,key);
const getResearch=(s,id)=>s.research[id]===true;
export function capacity(state,node){return (node.kind==='market'?600:node.kind==='warehouse'?600:OUTPUT_LIMIT)*(1+bonus(state,'storage')+(node.kind==='warehouse'?bonus(state,'warehouseCapacity'):0))*(1+0.25*(node.level-1));}
/** Maximum output when powered and supplied; compare with measured productionActivity(). */
export function maxProductionRate(state,node,catalog){
  const def=catalog.facilities[node.kind];if(!def?.output)return 0;
  const speed=(1+0.5*(node.level-1)+bonus(state,'speed'))*(1+researchModifier(state,'speed'));
  return def.rate*speed*(1+0.1*(state.investments.engineering||0))*(1+researchModifier(state,'output'))*(1+bonus(state,'output'))*(def.output==='data'?(1+bonus(state,'labOutput')+researchModifier(state,'labOutput')):1);
}
export function linkRate(state){return BASE_LINK_RATE*(1+bonus(state,'routing')+0.2*(state.investments.patents||0))*(1+researchModifier(state,'routing'));}
export function priceMultiplier(state,resource){
  const order=['ore','metal','parts','circuits','devices'];
  const idx=Math.max(0,order.indexOf(resource));
  return 1+0.22*Math.sin(state.elapsed/120+idx*1.8);
}
export function price(state,catalog,resource){
  const base=catalog.resources[resource]?.price||0;
  return base*priceMultiplier(state,resource)*(1+bonus(state,'pricing'))*(1+0.1*(state.investments.dividends||0))*(1+researchModifier(state,'pricing'));
}
export function sell(state,catalog,resource,amount){
  let remaining=amount;
  let sold=0;
  const unitPrice=price(state,catalog,resource)*(state.autoSell[resource]?(1+bonus(state,'autoPricing')):1);
  for(const node of state.nodes){
    if(node.kind!=='market')continue;
    const take=Math.min(remaining,node.buffer[resource]||0);
    if(take<=0)continue;
    node.buffer[resource]-=take;remaining-=take;sold+=take;
    const activity=marketActivity(node);
    recentMarketSales.set(node,{units:activity.units+take,revenue:activity.revenue+take*unitPrice});
    if(remaining<=0)break;
  }
  if(sold>0)earn(state,sold*unitPrice);
  return sold;
}
export function earn(state,amount,bonusXp=0){
  if(!Number.isFinite(amount)||amount<=0)return;
  state.credits+=amount;state.runRevenue+=amount;state.lifetimeRevenue+=amount;
  state.xp+=(amount*0.12+bonusXp)*(1+bonus(state,'xp'));
}
export function managerLevel(state){return factoryLevel(state);}
export function availableTalentPoints(state){return freeTalentPoints(state);}
/** Every generator contributes to its network; links do not multiply its power. */
export function generatorOutput(state,node,catalog){
  const def=catalog.facilities[node.kind];if(!def?.power||!node.enabled)return 0;
  const levelScale=node.kind==='solar'?1+(node.level-1):1+0.5*(node.level-1);
  return def.power*levelScale*(1+bonus(state,'powerGeneration'))*(node.kind==='solar'?(1+researchModifier(state,'solarPower')+bonus(state,'solarPower')):1);
}
export function gridStatus(state,catalog){
  const ids=new Map(state.nodes.map((n,i)=>[n.id,i]));
  const parent=state.nodes.map((_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(const edge of state.edges){if(edge.resource!=='power')continue;
    const a=ids.get(edge.from),b=ids.get(edge.to);if(a!==undefined&&b!==undefined)parent[find(b)]=find(a);
  }
  const groups=new Map();
  for(let i=0;i<state.nodes.length;i++){
    const root=find(i),node=state.nodes[i],def=catalog.facilities[node.kind];
    if(!groups.has(root))groups.set(root,{supply:0,demand:0,nodes:[]});
    const g=groups.get(root);g.nodes.push(node.id);
    if(!node.enabled)continue;
    g.supply+=generatorOutput(state,node,catalog);
    g.demand+=(def.demand||0)*Math.max(0.25,1-bonus(state,'powerSavings'))*Math.max(0.3,1-researchModifier(state,'powerSavings'));
  }
  const efficiency=new Map();let supply=0,demand=0;
  for(const group of groups.values()){
    supply+=group.supply;demand+=group.demand;
    for(const id of group.nodes)efficiency.set(id,group.demand>0?Math.min(1,group.supply/group.demand):1);
  }
  return {efficiency,supply,demand,groups};
}
export function contractAvailable(state,order){return !!order&&state.orders?.some(o=>o.id===order.id&&o.expiresAt>=(state.orderClock||0));}
export function marketQuantity(state,resource){return availableStock(state,resource);}
export function completeContract(state,catalog,id){return fulfillOrder(state,catalog,id,earn);}
function produceOneSecond(state,catalog,dt,offlineFactor){
  const defs=catalog.facilities, {efficiency}=gridStatus(state,catalog);
  const rate=linkRate(state)*dt;
  const lookup=new Map(state.nodes.map(n=>[n.id,n]));
  for(const edge of state.edges){
    if(edge.resource==='power')continue;
    const from=lookup.get(edge.from),to=lookup.get(edge.to);
    if(!from||!to||!from.enabled||!to.enabled)continue;
    const available=from.buffer[edge.resource]||0;
    const free=Math.max(0,capacity(state,to)-(to.buffer[edge.resource]||0));
    const qty=Math.min(available,free,rate);
    if(qty>0){
      from.buffer[edge.resource]=available-qty;to.buffer[edge.resource]=(to.buffer[edge.resource]||0)+qty;
      const diag=recentDiagnostics.get(to);
      if(diag)diag.received[edge.resource]=(diag.received[edge.resource]||0)+qty;
    }
  }
  for(const node of state.nodes){
    const def=defs[node.kind];
    if(!node.enabled||!def||!def.output)continue;
    const efficiencyFactor=efficiency.get(node.id)||0;
    const speed=(1+0.5*(node.level-1)+bonus(state,'speed'))*(1+researchModifier(state,'speed'));
    const idealFactor=speed;
    const powerFactor=speed*efficiencyFactor*offlineFactor;
    const inputs=def.inputs||{};
    const inputLimits=Object.entries(inputs).map(([resource,need])=>{
      const cost=need*dt*Math.max(0.2,1-bonus(state,'inputSavings'));
      return {resource,cap:cost>0?(node.buffer[resource]||0)/cost:Infinity,cost};
    });
    const outputUnit=def.rate*dt*(1+0.1*(state.investments.engineering||0))*(1+researchModifier(state,'output'))*(1+bonus(state,'output'))*(def.output==='data'?(1+bonus(state,'labOutput')+researchModifier(state,'labOutput')):1);
    const spaceCap=def.output==='data'?Infinity:Math.max(0,capacity(state,node)-(node.buffer[def.output]||0))/outputUnit;
    const factor=Math.min(powerFactor,spaceCap,...inputLimits.map(input=>input.cap));
    const diag=recentDiagnostics.get(node);
    if(diag){
      const reasons=[];
      if(offlineFactor<0.999&&powerFactor<idealFactor-1e-8&&Math.abs(powerFactor-factor)<1e-7)reasons.push('offline');
      if(efficiencyFactor<0.999&&Math.abs(powerFactor-factor)<1e-7)reasons.push('power');
      if(spaceCap<idealFactor-1e-8&&Math.abs(spaceCap-factor)<1e-7)reasons.push('storage');
      for(const input of inputLimits)if(input.cap<idealFactor-1e-8&&Math.abs(input.cap-factor)<1e-7)reasons.push(input.resource);
      for(const reason of reasons)diag.limits[reason]=(diag.limits[reason]||0)+dt;
    }
    if(factor<=0)continue;
    for(const input of inputLimits){
      const used=input.cost*factor;
      node.buffer[input.resource]=Math.max(0,(node.buffer[input.resource]||0)-used);
      if(diag)diag.consumed[input.resource]=(diag.consumed[input.resource]||0)+used;
    }
    const output=def.rate*dt*factor*(1+0.1*(state.investments.engineering||0))*(1+researchModifier(state,'output'))*(1+bonus(state,'output'))*(def.output==='data'?(1+bonus(state,'labOutput')+researchModifier(state,'labOutput')):1);
    if(def.output==='data'){state.data+=output;}else node.buffer[def.output]=(node.buffer[def.output]||0)+output;
    const activity=productionActivity(node);
    recentProduction.set(node,{produced:activity.produced+output,seconds:activity.seconds,rate:activity.rate});
  }
  for(const id of Object.keys(catalog.resources))if(state.autoSell[id]&&catalog.resources[id].price>0)sell(state,catalog,id,Infinity);
  state.elapsed+=dt;state.runElapsed+=dt;
}
export function simulate(state,catalog,seconds,{offline=false}={}){
  for(const node of state.nodes){
    if(node.kind==='market')recentMarketSales.set(node,{units:0,revenue:0});
    if(catalog.facilities[node.kind]?.output){
      recentProduction.set(node,{produced:0,seconds:0,rate:0});
      recentDiagnostics.set(node,{limits:{},received:{},consumed:{},seconds:0});
    }
  }
  let duration=Math.max(0,Math.min(offline?8*3600:3600,seconds));
  const efficiency=offline?Math.min(1,0.5+researchModifier(state,'offlinePower')):1;
  const simulated=duration;
  while(duration>1e-7){const dt=Math.min(1,duration);produceOneSecond(state,catalog,dt,efficiency);duration-=dt;}
  if(!offline)tickOrders(state,catalog,simulated);
  for(const node of state.nodes){
    const def=catalog.facilities[node.kind];if(!def?.output)continue;
    const activity=productionActivity(node);
    recentProduction.set(node,{produced:activity.produced,seconds:simulated,rate:simulated>0?activity.produced/simulated:0});
    const diag=recentDiagnostics.get(node);
    if(diag)diag.seconds=simulated;
  }
}
export function prestigeGain(state){return Math.max(0,Math.floor((Math.sqrt(state.runRevenue/2500)+state.runContracts*0.35)*(1+bonus(state,'angelGain'))));}
export function companyValue(state,catalog){return state.credits+state.nodes.reduce((sum,n)=>sum+catalog.facilities[n.kind].cost*n.level,0)+state.runRevenue*0.4;}
