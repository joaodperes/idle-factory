export function usedSlots(state,catalog){return state.nodes.reduce((sum,node)=>sum+(catalog.facilities[node.kind]?.slots||0),0);}
export function totalSlots(state){return 26+3*(state.investments.infrastructure||0);}
export function nodeCost(kind,state,catalog){
  const b=catalog.facilities[kind];
  const owned=state.nodes.filter(n=>n.kind===kind).length;
  return Math.ceil(b.cost*Math.pow(1.18,Math.max(0,owned-1)));
}
export function upgradeCost(node,catalog){return Math.ceil(catalog.facilities[node.kind].cost*(0.6+node.level*0.7)*Math.pow(1.65,node.level-1));}
export function canConnect(state,catalog,fromId,toId,resource){
  const a=state.nodes.find(n=>n.id===fromId),b=state.nodes.find(n=>n.id===toId);
  if(!a||!b||a.id===b.id)return 'Choose two different facilities.';
  if(state.edges.length>=260)return 'Maximum link count reached.';
  if(state.edges.some(e=>e.from===fromId&&e.to===toId&&e.resource===resource))return 'That link already exists.';
  if(resource==='power')return null;
  if(!catalog.resources[resource]||catalog.facilities[a.kind].output!==resource)return 'Source does not produce that material.';
  if(b.kind!=='market'&&!catalog.facilities[b.kind].inputs?.[resource])return 'Target cannot consume that material.';
  return null;
}
export function addEdge(state,catalog,from,to,resource){
  const error=canConnect(state,catalog,from,to,resource);
  if(error)return error;
  state.edges.push({id:`e${state.nextId++}`,from,to,resource});
  return null;
}
export function addFacility(state,catalog,kind,x=450,y=450){
  const facility=catalog.facilities[kind];
  if(!facility)return 'Unknown facility';
  if(state.runRevenue<facility.unlock)return `Unlocks at ${facility.unlock} run revenue`;
  if(state.nodes.length>=120)return 'Maximum facility count reached';
  if(usedSlots(state,catalog)+facility.slots>totalSlots(state))return 'Not enough industrial capacity';
  const cost=nodeCost(kind,state,catalog);
  if(state.credits<cost)return 'Not enough credits';
  state.credits-=cost;
  const node={id:`n${state.nextId++}`,kind,x:Math.max(0,Math.min(2300,Math.round(x))),y:Math.max(0,Math.min(1400,Math.round(y))),level:1,enabled:true,buffer:{}};
  state.nodes.push(node);state.selectedNode=node.id;
  return null;
}
export function removeFacility(state,catalog,id){
  const node=state.nodes.find(n=>n.id===id);
  if(!node)return 'Facility not found';
  if(state.nodes.length===1)return 'Keep at least one facility';
  const refund=Math.floor(catalog.facilities[node.kind].cost*0.4);
  state.credits+=refund;
  state.nodes=state.nodes.filter(n=>n.id!==id);
  state.edges=state.edges.filter(e=>e.from!==id&&e.to!==id);
  if(state.selectedNode===id)state.selectedNode=state.nodes[0]?.id||null;
  return null;
}
export function moveFacility(state,id,x,y){
  const node=state.nodes.find(n=>n.id===id);
  if(node){node.x=Math.max(0,Math.min(2300,Math.round(x)));node.y=Math.max(0,Math.min(1400,Math.round(y)));}
}
