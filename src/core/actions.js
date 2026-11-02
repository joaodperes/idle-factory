import {defaultState,operatingGraph} from './state.js';
import {addFacility,removeFacility,addEdge,upgradeCost,usedSlots,totalSlots,nodeCost,normalizePowerEdges} from './graph.js';
import {prestigeGain} from './engine.js';
import {talentStatus,findTalent,talentModifier,refundTalents} from './talents.js';
export {addFacility,removeFacility,addEdge};
export function upgradeFacility(state,catalog,id){
  const node=state.nodes.find(n=>n.id===id);if(!node)return 'Facility not found';
  if(node.level>=20)return 'Maximum facility level reached';
  const cost=upgradeCost(node,catalog);if(state.credits<cost)return 'Not enough credits';
  state.credits-=cost;node.level++;return null;
}
export function buyResearch(state,catalog,id){
  const research=catalog.research[id];if(!research||state.research[id])return 'Already researched or unavailable';
  if(research.requires.some(req=>!state.research[req]))return 'Missing prerequisite';
  if(state.data<research.cost)return 'Insufficient research data';
  state.data-=research.cost;state.research[id]=true;return null;
}
export function buyTalent(state,catalog,id){
  const status=talentStatus(state,catalog,id);
  if(!status.enabled)return status.reason;
  if(!findTalent(catalog,id))return 'Talent not found';
  state.talents[id]=(state.talents[id]||0)+1;
  return null;
}
/** Free respec keeps players experimenting with different factory builds. */
export function respecTalents(state){
  refundTalents(state);
  // Disable Auto-Trading toggles if this build no longer has that perk.
  for(const resource of Object.keys(state.autoSell||{}))if(resource!=='metal')state.autoSell[resource]=false;
  return null;
}
export function buyInvestment(state,catalog,id){
  const investment=catalog.investments[id];if(!investment)return 'Investment not found';
  const rank=state.investments[id]||0;if(rank>=investment.max)return 'Investment is fully upgraded';
  const cost=Math.ceil(investment.cost*Math.pow(investment.growth,rank));
  if(state.angels<cost)return 'Not enough angel investors';
  state.angels-=cost;state.investments[id]=rank+1;return null;
}
export function resetCompany(state){
  const earned=prestigeGain(state);
  if(earned<1)return {error:'Earn more revenue before seeking investment'};
  const next=defaultState();
  next.angels=state.angels+earned;next.totalAngels=state.totalAngels+earned;
  next.investments={...state.investments};next.talents={...state.talents};
  next.specialization=null;next.xp=state.xp;
  next.lifetimeRevenue=state.lifetimeRevenue;next.contractsFilled=state.contractsFilled;
  next.elapsed=state.elapsed;next.layouts=state.layouts;
  next.stats={...state.stats,resets:state.stats.resets+1};
  const restored=operatingGraph();
  next.nodes=restored.nodes;next.edges=restored.edges;next.nextId=5;next.selectedNode='n3';
  // Prestiged players should immediately earn revenue, not repeat the first-time tutorial.
  next.credits=250;
  next.onboarding=true;next.tutorialStep=7;
  next.credits+=300*(state.investments.capital||0)+talentModifier(state,'startup');
  return {state:next,earned};
}
export function saveLayout(state,name){
  const layout={name:String(name||'Factory template').slice(0,32),
    nodes:state.nodes.map(({id,kind,x,y})=>({id,kind,x,y})),
    edges:state.edges.map(({from,to,resource})=>({from,to,resource}))};
  state.layouts=[layout,...state.layouts].slice(0,5);
}
export function loadLayout(state,catalog,index){
  const layout=state.layouts[index];if(!layout)return 'Layout not found';
  const countSlots=layout.nodes.reduce((sum,n)=>sum+(catalog.facilities[n.kind]?.slots||999),0);
  if(countSlots>totalSlots(state))return 'The planned layout exceeds industrial capacity';
  if(layout.nodes.length>120)return 'Too many facilities';
  const refund=state.nodes.reduce((sum,n)=>sum+catalog.facilities[n.kind].cost*0.4,0);
  const temp={...state,credits:state.credits+refund,nodes:[],edges:[],nextId:state.nextId};
  const mapping=new Map();
  for(const def of layout.nodes){
    const id=`n${temp.nextId}`;
    const error=addFacility(temp,catalog,def.kind,def.x,def.y);
    if(error)return `Blueprint cannot be funded: ${error}`;
    mapping.set(def.id,id);
  }
  for(const edge of layout.edges){
    if(!mapping.has(edge.from)||!mapping.has(edge.to))continue;
    const from=mapping.get(edge.from),to=mapping.get(edge.to);
    // Reconstruct legacy power relays before converting them into direct generator links.
    if(edge.resource==='power')temp.edges.push({id:`e${temp.nextId++}`,from,to,resource:'power'});
    else addEdge(temp,catalog,from,to,edge.resource);
  }
  normalizePowerEdges(temp,catalog);
  state.credits=temp.credits;state.nodes=temp.nodes;state.edges=temp.edges;
  state.nextId=temp.nextId;state.selectedNode=state.nodes[0]?.id||null;
  return null;
}
/** Kept as a compatibility stub for old callers; no exclusive specialization exists. */
export function setSpecialization(){return 'Select individual talents in the tree instead of a specialization';}
