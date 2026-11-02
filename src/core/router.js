/** Obstacle-aware orthogonal routing for factory connections, in unscaled canvas coordinates. */
const STEP=20, MARGIN=12, STUB=26, MAX_X=2500, MAX_Y=1650;
const point=(x,y)=>({x,y});
const close=(a,b)=>Math.abs(a.x-b.x)<0.01&&Math.abs(a.y-b.y)<0.01;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const inflate=r=>({left:r.x-MARGIN,right:r.x+r.width+MARGIN,top:r.y-MARGIN,bottom:r.y+r.height+MARGIN});
function clearSegment(a,b,rects){
  if(a.x!==b.x&&a.y!==b.y)return false;
  return rects.every(r=>a.x===b.x
    ?a.x<r.left||a.x>r.right||Math.max(a.y,b.y)<r.top||Math.min(a.y,b.y)>r.bottom
    :a.y<r.top||a.y>r.bottom||Math.max(a.x,b.x)<r.left||Math.min(a.x,b.x)>r.right);
}
const clearPath=(points,rects)=>points.every((p,i)=>i===0||clearSegment(points[i-1],p,rects));
function simplify(points){
  const clean=[];
  for(const p of points){
    if(clean.length&&close(clean[clean.length-1],p))continue;
    clean.push(p);
    while(clean.length>=3){
      const a=clean.at(-3),b=clean.at(-2),c=clean.at(-1);
      if((a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y))clean.splice(clean.length-2,1);
      else break;
    }
  }
  return clean;
}
function candidatePaths(a,b,rects){
  const middle=(a.x+b.x)/2;
  const candidates=[
    [a,point(b.x,a.y),b],
    [a,point(a.x,b.y),b],
    [a,point(middle,a.y),point(middle,b.y),b]
  ];
  const rows=[...new Set([Math.max(0,Math.min(a.y,b.y,...rects.map(r=>r.top))-STEP),
    Math.min(MAX_Y,Math.max(a.y,b.y,...rects.map(r=>r.bottom))+STEP),
    ...rects.flatMap(r=>[Math.max(0,r.top-STEP),Math.min(MAX_Y,r.bottom+STEP)])])];
  const cols=[...new Set([Math.max(0,Math.min(a.x,b.x,...rects.map(r=>r.left))-STEP),
    Math.min(MAX_X,Math.max(a.x,b.x,...rects.map(r=>r.right))+STEP),
    ...rects.flatMap(r=>[Math.max(0,r.left-STEP),Math.min(MAX_X,r.right+STEP)])])];
  for(const y of rows)candidates.push([a,point(a.x,y),point(b.x,y),b]);
  for(const x of cols)candidates.push([a,point(x,a.y),point(x,b.y),b]);
  const valid=candidates.filter(path=>path.every(p=>p.x>=0&&p.x<=MAX_X&&p.y>=0&&p.y<=MAX_Y)&&clearPath(path,rects));
  valid.sort((p,q)=>p.reduce((sum,v,i)=>sum+(i?distance(v,p[i-1]):0),0)+p.length*9-
    (q.reduce((sum,v,i)=>sum+(i?distance(v,q[i-1]):0),0)+q.length*9));
  return valid[0]||null;
}
class Heap{
  constructor(){this.values=[];}
  push(item){const a=this.values;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].f<=item.f)break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.values,top=a[0],last=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return top;}
  get length(){return this.values.length;}
}
function gridRoute(a,b,rects){
  const blocked=p=>p.x<0||p.y<0||p.x>MAX_X||p.y>MAX_Y||
    rects.some(r=>p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom);
  function entrances(origin){
    const cx=Math.round(origin.x/STEP),cy=Math.round(origin.y/STEP);
    const candidates=[];
    for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++){
      const p=point(x*STEP,y*STEP);
      if(blocked(p))continue;
      const via1=[origin,point(p.x,origin.y),p],via2=[origin,point(origin.x,p.y),p];
      const via=clearPath(via1,rects)?via1:clearPath(via2,rects)?via2:null;
      if(via)candidates.push({x,y,via,dist:distance(origin,p)});
    }
    candidates.sort((x,y)=>x.dist-y.dist);
    return candidates.slice(0,5);
  }
  const starts=entrances(a),ends=entrances(b);
  if(!starts.length||!ends.length)return null;
  const destSet=new Map(ends.map(v=>[v.x+','+v.y,v]));
  const heap=new Heap(),best=new Map(),prev=new Map();
  const key=(x,y,d)=>x+','+y+','+d;
  for(const start of starts){
    const k=key(start.x,start.y,4),h=Math.min(...ends.map(v=>distance(start,v)));
    heap.push({x:start.x,y:start.y,d:4,g:start.dist,f:start.dist+h*STEP,k,start});
    best.set(k,start.dist);
  }
  const directions=[[1,0],[0,1],[-1,0],[0,-1]];
  let expanded=0;
  while(heap.length&&expanded++<9500){
    const current=heap.pop();
    if(current.g!==best.get(current.k))continue;
    const end=destSet.get(current.x+','+current.y);
    if(end){
      const middle=[];let k=current.k;
      while(k){const s=prev.get(k);if(!s)break;middle.push(point(s.x*STEP,s.y*STEP));k=s.from;}
      middle.reverse();
      const points=[...current.start.via,...middle,...end.via.slice(1,-1).reverse(),b];
      return simplify(points);
    }
    for(let d=0;d<4;d++){
      const x=current.x+directions[d][0],y=current.y+directions[d][1],p=point(x*STEP,y*STEP);
      if(blocked(p))continue;
      const g=current.g+STEP+(current.d!==4&&current.d!==d?8:0);
      const k=key(x,y,d);
      if(g>=(best.get(k)??Infinity))continue;
      const h=Math.min(...ends.map(v=>distance(point(x,y),v)))*STEP;
      best.set(k,g);prev.set(k,{x,y,from:current.k});
      heap.push({x,y,d,g,f:g+h,k,start:current.start});
    }
  }
  return null;
}
/**
 * Return an orthogonal route around every facility. Port stubs are intentionally
 * outside card bounds before obstacle checks begin.
 */
export function routeConnection(from,to,facilities){
  const rects=facilities.map(inflate);
  const start=point(from.x+STUB,from.y),end=point(to.x-STUB,to.y);
  const center=candidatePaths(start,end,rects)||gridRoute(start,end,rects);
  if(!center)return [from,to]; // Only for overlapping/unroutable layouts.
  return simplify([from,...center,to]);
}
/** Render smooth corners without allowing them to cut across any card (12px margin). */
export function routePath(points){
  if(points.length<2)return '';
  const n=v=>Number(v.toFixed(2));
  let d='M'+n(points[0].x)+' '+n(points[0].y);
  for(let i=1;i<points.length;i++){
    const p=points[i];
    if(i===points.length-1){d+=' L'+n(p.x)+' '+n(p.y);continue;}
    const a=points[i-1],c=points[i+1];
    const len1=distance(a,p),len2=distance(p,c),radius=Math.min(8,len1/2,len2/2);
    if(radius<1){d+=' L'+n(p.x)+' '+n(p.y);continue;}
    const incoming=point(p.x+Math.sign(a.x-p.x)*radius,p.y+Math.sign(a.y-p.y)*radius);
    const outgoing=point(p.x+Math.sign(c.x-p.x)*radius,p.y+Math.sign(c.y-p.y)*radius);
    d+=' L'+n(incoming.x)+' '+n(incoming.y)+' Q'+n(p.x)+' '+n(p.y)+' '+n(outgoing.x)+' '+n(outgoing.y);
  }
  return d;
}
