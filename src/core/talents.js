/** Talent modifiers are mirrored from the versioned JSON tree catalog for engine use. */
export const TALENT_EFFECTS={
  "lean": {
    "inputSavings": 0.08
  },
  "precision": {
    "speed": 0.1
  },
  "grid": {
    "powerSavings": 0.08
  },
  "recycling": {
    "inputSavings": 0.06
  },
  "yield_mastery": {
    "output": 0.06
  },
  "heat_recovery": {
    "powerSavings": 0.07
  },
  "adaptive_control": {
    "speed": 0.08,
    "output": 0.03,
    "labOutput": 0.06
  },
  "batch_processing": {
    "speed": 0.12,
    "storage": 0.08
  },
  "grid_buffer": {
    "powerGeneration": 0.12,
    "solarPower": 0.12
  },
  "eco_mode": {
    "powerSavings": 0.22
  },
  "turbo_mode": {
    "speed": 0.35,
    "powerSavings": -0.12
  },
  "master_engineer": {
    "output": 0.15,
    "slots": 2
  },
  "routing": {
    "routing": 0.2
  },
  "storage": {
    "storage": 0.2
  },
  "layout": {
    "slots": 1
  },
  "express_links": {
    "routing": 0.15
  },
  "inventory_control": {
    "storage": 0.15,
    "slots": 1
  },
  "automation": {
    "autoPricing": 0.08,
    "labOutput": 0.1
  },
  "smart_dispatch": {
    "routing": 0.1,
    "speed": 0.05
  },
  "buffer_management": {
    "storage": 0.2
  },
  "industrial_planning": {
    "slots": 2
  },
  "just_in_time": {
    "routing": 0.3,
    "storage": -0.15
  },
  "bulk_logistics": {
    "storage": 0.35,
    "slots": 2
  },
  "factory_os": {
    "routing": 0.3,
    "slots": 5
  },
  "pricing": {
    "pricing": 0.1
  },
  "negotiation": {
    "contracts": 0.12
  },
  "seed": {
    "startup": 200
  },
  "price_forecasting": {
    "pricing": 0.08
  },
  "regional_contracts": {
    "contracts": 0.12
  },
  "workforce": {
    "xp": 0.12
  },
  "premium_goods": {
    "pricing": 0.08
  },
  "procurement": {
    "inputSavings": 0.05,
    "contracts": 0.06
  },
  "corporate_training": {
    "xp": 0.15,
    "slots": 1,
    "labOutput": 0.1
  },
  "luxury_brand": {
    "pricing": 0.25
  },
  "volume_trader": {
    "contracts": 0.3,
    "xp": 0.1
  },
  "industrial_empire": {
    "pricing": 0.15,
    "contracts": 0.15,
    "xp": 0.1
  }
};
export const TALENT_UNLOCK_LEVEL=5;
export const TIER_RULES=Object.freeze({
  1:{spent:0},
  2:{spent:3},
  3:{spent:7},
  4:{spent:12},
  5:{spent:17}
});
export function factoryLevel(state){
  return Math.min(60,1+Math.floor(Math.sqrt(Math.max(0,state.xp||0)/60)));
}
export function nextFactoryLevelXp(state){
  const level=factoryLevel(state);
  return level>=60?null:60*level*level;
}
export function pointsEarned(state){return Math.max(0,factoryLevel(state)-TALENT_UNLOCK_LEVEL+1);}
export function talentPointsUsed(state){
  return Object.entries(TALENT_EFFECTS).reduce((total,[id])=>total+Math.max(0,state.talents?.[id]||0),0);
}
export function freeTalentPoints(state){return Math.max(0,pointsEarned(state)-talentPointsUsed(state));}
export function talentModifier(state,effect){
  return Object.entries(TALENT_EFFECTS).reduce((sum,[id,values])=>sum+(state.talents?.[id]||0)*(values[effect]||0),0);
}
export function findTalent(catalog,id){
  for(const [treeId,tree] of Object.entries(catalog.talents||{})){
    const node=tree.nodes?.find(n=>n.id===id);
    if(node)return {node,tree,treeId};
  }
  return null;
}
export function talentStatus(state,catalog,id){
  const target=findTalent(catalog,id);
  if(!target)return {enabled:false,reason:'Unknown talent'};
  const {node,tree}=target,level=factoryLevel(state);
  if(level<TALENT_UNLOCK_LEVEL)return {enabled:false,reason:`Unlock at Factory Level ${TALENT_UNLOCK_LEVEL}`};
  if((state.talents[node.id]||0)>=node.max)return {enabled:false,reason:'Fully trained'};
  if(freeTalentPoints(state)<1)return {enabled:false,reason:'Earn a Factory Level for another talent point'};
  const rule=TIER_RULES[node.tier];
  // Deeper tiers are gated by points spent in this tree, never by Factory Level.
  const spent=tree.nodes.reduce((sum,n)=>sum+(state.talents[n.id]||0),0);
  if(spent<rule.spent)return {enabled:false,reason:`Spend ${rule.spent-spent} more point(s) in this tree`};
  if(node.choice&&tree.nodes.some(peer=>peer.id!==node.id&&peer.choice===node.choice&&(state.talents[peer.id]||0)>0))
    return {enabled:false,reason:'Mutually exclusive: refund your other doctrine to switch'};
  if(node.requires?.length&&!node.requires.some(parent=>(state.talents[parent]||0)>0))
    return {enabled:false,reason:'Requires one linked earlier talent'};
  return {enabled:true,reason:'Ready to learn'};
}
export function refundTalents(state){state.talents={};}
