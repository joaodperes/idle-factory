/** Pure presentation helpers for per-machine link inspection and safe selection. */
export function connectionsForMachine(edges,machineId){
  if(!machineId)return [];
  return edges.filter(edge=>edge.from===machineId||edge.to===machineId);
}
export function validLinkFocus(edges,id,machineId){
  return edges.some(edge=>edge.id===id&&(edge.from===machineId||edge.to===machineId))?id:null;
}
export function connectionAppearance(edge,machineId,activeId,focusMachine=true){
  const related=!!machineId&&(edge.from===machineId||edge.to===machineId);
  const focused=!!activeId&&edge.id===activeId;
  const dimmed=activeId?!focused:!!machineId&&focusMachine&&!related;
  return {related,focused,dimmed};
}
