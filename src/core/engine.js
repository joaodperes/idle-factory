/** Deterministic discrete-time factory engine. All production flows through saved graph edges. */
const OUTPUT_LIMIT=120;
const recentMarketSales=new WeakMap();
/** Sales made during the most recent simulation update (not cumulative inventory). */
export function marketActivity(node){return recentMarketSales.get(node)||{units:0,revenue:0};}
const BASE_LINK_RATE=3;
const BRANCH={lean:'engineer',precision:'engineer',grid:'engineer',routing:'architect',storage:'architect',automation:'architect',pricing:'strategist',negotiation:'strategist',seed:'strategist'};
const getTalent=(s,id)=>BRANCH[id]===s.specialization?(s.talents[id]||0):0;
const getResearch=(s,id)=>s.research[id]===true;
export function capacity(state,node){return (node.kind==='market'?600:OUTPUT_LIMIT)*(1+0.5*getTalent(state,'storage'));}
export function linkRate(state){return BASE_LINK_RATE*(1+0.4*getTalent(state,'routing')+0.2*(state.investments.patents||0))*(getResearch(state,'logistics')?1.5:1);}
export function priceMultiplier(state,resource){
  const order=['ore','metal','parts','circuits','devices'];
  const idx=Math.max(0,order.indexOf(resource));
  return 1+0.22*Math.sin(state.elapsed/120+idx*1.8);
}
export function price(state,catalog,resource){
  const base=catalog.resources[resource]?.price||0;
  return base*priceMultiplier(state,resource)*(1+0.15*getTalent(state,'pricing'))*(1+0.1*(state.investments.dividends||0))*(getResearch(state,'market')?1.2:1);
}
export function sell(state,catalog,resource,amount){
  let remaining=amount;
  let sold=0;
  const unitPrice=price(state,catalog,resource);
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
  state.xp+=amount*0.12+bonusXp;
}
export function managerLevel(state){return Math.min(70,1+Math.floor(Math.sqrt(state.xp/180)));}
export function availableTalentPoints(state){return Math.max(0,managerLevel(state)-1-Object.values(state.talents).reduce((a,b)=>a+b,0));}
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
    g.supply+=(def.power||0)*(1+0.2*(node.level-1));
    g.demand+=(def.demand||0)*(1-0.15*getTalent(state,'grid'))*(getResearch(state,'energy')?0.8:1);
  }
  const efficiency=new Map();let supply=0,demand=0;
  for(const group of groups.values()){
    supply+=group.supply;demand+=group.demand;
    for(const id of group.nodes)efficiency.set(id,group.demand>0?Math.min(1,group.supply/group.demand):1);
  }
  return {efficiency,supply,demand,groups};
}
export function contractAvailable(state,contract){return (state.contractRuns[contract.id]||0)<=state.runElapsed;}
export function marketQuantity(state,resource){return state.nodes.filter(n=>n.kind==='market').reduce((s,n)=>s+(n.buffer[resource]||0),0);}
export function completeContract(state,catalog,id){
  const contract=catalog.contracts.find(c=>c.id===id);
  if(!contract)return 'Contract unavailable';
  if(!contractAvailable(state,contract))return 'Contract is on cooldown';
  if(marketQuantity(state,contract.resource)+1e-7<contract.amount)return 'Not enough goods at trade terminals';
  let remaining=contract.amount;
  for(const n of state.nodes){if(n.kind!=='market')continue;const taken=Math.min(remaining,n.buffer[contract.resource]||0);n.buffer[contract.resource]-=taken;remaining-=taken;}
  const bonus=1+0.2*getTalent(state,'negotiation');
  earn(state,contract.reward*bonus,contract.xp);
  state.contractRuns[id]=state.runElapsed+120;
  state.runContracts++;state.contractsFilled++;
  return null;
}
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
    if(qty>0){from.buffer[edge.resource]=available-qty;to.buffer[edge.resource]=(to.buffer[edge.resource]||0)+qty;}
  }
  for(const node of state.nodes){
    const def=defs[node.kind];
    if(!node.enabled||!def||!def.output)continue;
    const efficiencyFactor=efficiency.get(node.id)||0;
    const speed=(1+0.25*(node.level-1)+0.15*getTalent(state,'precision'))*(getResearch(state,'robotics')?1.5:1);
    let factor=speed*efficiencyFactor*offlineFactor;
    const inputs=def.inputs||{};
    for(const [resource,need] of Object.entries(inputs)){
      const cost=need*dt*(1-0.1*getTalent(state,'lean'));
      if(cost>0)factor=Math.min(factor,(node.buffer[resource]||0)/cost);
    }
    factor=Math.min(factor,Math.max(0,capacity(state,node)-(node.buffer[def.output]||0))/(def.rate*dt*(1+0.1*(state.investments.engineering||0))*(getResearch(state,'yield')?1.25:1)));
    if(factor<=0)continue;
    for(const [resource,need] of Object.entries(inputs))node.buffer[resource]=Math.max(0,(node.buffer[resource]||0)-need*dt*(1-0.1*getTalent(state,'lean'))*factor);
    const output=def.rate*dt*factor*(1+0.1*(state.investments.engineering||0))*(getResearch(state,'yield')?1.25:1);
    if(def.output==='data'){state.data+=output;}else node.buffer[def.output]=(node.buffer[def.output]||0)+output;
  }
  for(const id of Object.keys(catalog.resources))if(state.autoSell[id]&&catalog.resources[id].price>0&&(id==='metal'||(state.specialization==='architect'&&getTalent(state,'automation'))))sell(state,catalog,id,Infinity);
  state.elapsed+=dt;state.runElapsed+=dt;
}
export function simulate(state,catalog,seconds,{offline=false}={}){
  for(const node of state.nodes)if(node.kind==='market')recentMarketSales.set(node,{units:0,revenue:0});
  let duration=Math.max(0,Math.min(offline?8*3600:3600,seconds));
  const efficiency=offline?(getResearch(state,'offline')?1:0.5):1;
  while(duration>1e-7){const dt=Math.min(1,duration);produceOneSecond(state,catalog,dt,efficiency);duration-=dt;}
}
export function prestigeGain(state){return Math.max(0,Math.floor(Math.sqrt(state.runRevenue/2500)+state.runContracts*0.35));}
export function companyValue(state,catalog){return state.credits+state.nodes.reduce((sum,n)=>sum+catalog.facilities[n.kind].cost*n.level,0)+state.runRevenue*0.4;}
