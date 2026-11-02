/** Logical workspace dimensions are independent of zoom and viewport size. */
export const INITIAL_CANVAS_WIDTH=2500,INITIAL_CANVAS_HEIGHT=1650;
const PADDING=450,GROW_STEP=250,NODE_WIDTH=207,NODE_HEIGHT=180;
/** Expand as needed without shrinking previously explored space during this session. */
export function expandedWorkspace(nodes=[],extraX=0,extraY=0,current={width:INITIAL_CANVAS_WIDTH,height:INITIAL_CANVAS_HEIGHT}){
  const furthestX=Math.max(0,extraX,...nodes.map(n=>n.x+NODE_WIDTH));
  const furthestY=Math.max(0,extraY,...nodes.map(n=>n.y+NODE_HEIGHT));
  return {
    width:Math.max(INITIAL_CANVAS_WIDTH,current.width,Math.ceil((furthestX+PADDING)/GROW_STEP)*GROW_STEP),
    height:Math.max(INITIAL_CANVAS_HEIGHT,current.height,Math.ceil((furthestY+PADDING)/GROW_STEP)*GROW_STEP)
  };
}
