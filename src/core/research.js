import {talentModifier} from './talents.js';
export const RESEARCH_EFFECTS={
  "logistics": {
    "routing": 0.5
  },
  "market": {
    "pricing": 0.2
  },
  "energy": {
    "powerSavings": 0.2
  },
  "yield": {
    "output": 0.25
  },
  "supply_ai": {
    "routing": 0.2
  },
  "solar_cells": {
    "solarPower": 0.5
  },
  "robotics": {
    "speed": 0.5
  },
  "offline": {
    "offlinePower": 0.5
  },
  "contract_network": {
    "contracts": 0.15
  },
  "superconductors": {
    "powerSavings": 0.12
  },
  "synthesis": {
    "output": 0.12
  },
  "analytics": {
    "pricing": 0.12
  },
  "quantum": {
    "routing": 0.4
  },
  "machine_learning": {
    "speed": 0.2,
    "labOutput": 0.15
  },
  "research_acceleration": {
    "labOutput": 0.3
  },
  "global_grid": {
    "solarPower": 0.6
  },
  "factory_scale": {
    "slots": 4
  },
  "frontier": {
    "labOutput": 0.4,
    "licenseYield": 0.2,
    "researchUnification": 1
  }
};
export function researchModifier(state,key){return Object.entries(RESEARCH_EFFECTS).reduce((sum,[id,mods])=>sum+(state.research?.[id]===true?(mods[key]||0):0),0);}
export function researchLicensingCost(state){return 80+25*Math.max(0,state.researchLicenses||0);}
export function researchLicensingReward(state){return Math.round((450+100*Math.max(0,state.researchLicenses||0))*(1+researchModifier(state,'licenseYield')));}
export function effectiveResearchCost(state,entry){
 const discount=Math.min(.75,Math.max(0,talentModifier(state,'researchDiscount')));
 return Math.ceil(entry.cost*(1-discount));
}
export function researchStatus(state,catalog,id){
 const item=catalog.research[id];
 if(!item)return {ready:false,reason:'Unknown technology'};
 if(state.research[id])return {ready:false,reason:'Researched'};
 const missing=(item.requires||[]).filter(req=>!state.research[req]);
 if(missing.length)return {ready:false,reason:'Requires '+missing.map(req=>catalog.research[req]?.name||req).join(' and ')};
 const advanced=talentModifier(state,'researchUnification')>0||researchModifier(state,'researchUnification')>0;
 if(item.choice&&!advanced&&Object.values(catalog.research).some(other=>other.id!==id&&other.choice===item.choice&&state.research[other.id]))
   return {ready:false,reason:'Conflicts with an existing research choice. Advance the Scientist career to reunify.'};
 const cost=effectiveResearchCost(state,item);
 if(state.data<cost)return {ready:false,reason:'Need '+Math.ceil(cost-state.data)+' more Research Data'};
 return {ready:true,reason:'Available'};
}
