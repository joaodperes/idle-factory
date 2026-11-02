import {normalizePowerEdges} from './graph.js';
export const SAVE_KEY = 'idle-factory-save-v3';
const OLD_SAVE_KEY = 'factory-idle-v2';
const asObject = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const number = (v, fallback = 0, max = 1e12) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(v, max)) : fallback;
const integer = (v, fallback = 0, max = 1e6) => Math.floor(number(v, fallback, max));
const text = (v, fallback = '') => typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : fallback;
export function makeNode(id, kind, x, y) { return {id, kind, x, y, level:1, enabled:true, buffer:{}}; }
export function starterGraph(){
  return {
    nodes:[makeNode('n1','generator',80,120),makeNode('n2','mine',365,120)],
    edges:[]
  };
}
/** Established companies receive a running production line on prestige; new players learn from two machines. */
export function operatingGraph(){
  return {
    nodes:[makeNode('n1','generator',80,120),makeNode('n2','mine',365,80),makeNode('n3','smelter',650,130),makeNode('n4','market',960,130)],
    edges:[
      {id:'e1',from:'n1',to:'n2',resource:'power'},
      {id:'e2',from:'n1',to:'n3',resource:'power'},
      {id:'e3',from:'n2',to:'n3',resource:'ore'},
      {id:'e4',from:'n3',to:'n4',resource:'metal'}
    ]
  };
}
export function defaultState() {
  return {
    version:3, credits:900, data:0, angels:0, totalAngels:0,
    runRevenue:0, lifetimeRevenue:0, contractsFilled:0, runContracts:0,
    xp:0, elapsed:0, runElapsed:0, lastSeen:Date.now(),
    specialization:null, talents:{}, investments:{}, research:{},
    nodes:starterGraph().nodes, edges:starterGraph().edges, nextId:3,
    autoSell:{metal:true}, contractRuns:{}, dailyContracts:{}, researchLicenses:0, selectedNode:'n1', layouts:[],
    stats:{resets:0, clicks:0}, onboarding:false, tutorialStep:0
  };
}
export function sanitizeSave(raw, catalog) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Save is not an object.');
  if (raw.version != null && raw.version > 3) throw new Error('This save requires a newer version of Idle Factory.');
  if (raw.version !== 3) return migrateV2(raw);
  const s = defaultState();
  for (const k of ['credits','data','angels','totalAngels','runRevenue','lifetimeRevenue','xp','elapsed','runElapsed','lastSeen']) s[k]=number(raw[k],s[k], k==='lastSeen'?1e15:1e13);
  for (const k of ['contractsFilled','runContracts','nextId']) s[k]=integer(raw[k],s[k]);
  // Previous specialization choices are deprecated; no tree is selected by default.
  s.specialization=null;
  const allowedTalents = Object.values(catalog.talents).flatMap(branch=>branch.nodes);
  for (const t of allowedTalents) s.talents[t.id] = integer(asObject(raw.talents)[t.id],0,t.max);
  s.researchLicenses=integer(raw.researchLicenses,0,100000);
  const rawDaily=asObject(raw.dailyContracts);
  s.dailyContracts={};
  for(const def of catalog.contracts){const date=rawDaily[def.id];if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date))s.dailyContracts[def.id]=date;}
  for (const [id,def] of Object.entries(catalog.investments)) s.investments[id]=integer(asObject(raw.investments)[id],0,def.max);
  for (const id of Object.keys(catalog.research)) if(asObject(raw.research)[id] === true) s.research[id]=true;
  s.autoSell={}; for(const id of Object.keys(catalog.resources)) if(asObject(raw.autoSell)[id]===true)s.autoSell[id]=true;
  s.contractRuns={}; for(const def of catalog.contracts) s.contractRuns[def.id]=number(asObject(raw.contractRuns)[def.id],0,1e12);
  const sourceNodes=Array.isArray(raw.nodes)?raw.nodes:[];
  const used=new Set();
  s.nodes=sourceNodes.slice(0,120).flatMap(n=>{
    if(!n || !catalog.facilities[n.kind])return [];
    const id=text(n.id);
    if(!id || used.has(id))return [];
    used.add(id);
    const buffer={}; for(const resource of Object.keys(catalog.resources)) buffer[resource]=number(asObject(n.buffer)[resource],0,1e4);
    return [{id,kind:n.kind,x:integer(n.x,0,1e7),y:integer(n.y,0,1e7),level:integer(n.level,1,20)||1,enabled:n.enabled!==false,buffer}];
  });
  const seen=new Set();
  s.edges=(Array.isArray(raw.edges)?raw.edges:[]).slice(0,260).flatMap(e=>{
    if(!e || !used.has(e.from) || !used.has(e.to) || e.from===e.to || !['power',...Object.keys(catalog.resources)].includes(e.resource))return [];
    const key=`${e.from}:${e.to}:${e.resource}`;
    if(seen.has(key))return [];
    seen.add(key);
    const from=s.nodes.find(n=>n.id===e.from),to=s.nodes.find(n=>n.id===e.to);
    if(e.resource==='power' && (!catalog.facilities[from.kind].power&&!catalog.facilities[from.kind].demand&&!catalog.facilities[to.kind].demand))return []; // Legacy relay links are normalized below.
    if(e.resource!=='power' && (catalog.facilities[from.kind].output!==e.resource || (to.kind!=='market' && !catalog.facilities[to.kind].inputs?.[e.resource])))return [];
    return [{id:text(e.id,`e${s.edges?.length||seen.size}`),from:e.from,to:e.to,resource:e.resource}];
  });
  s.selectedNode=used.has(raw.selectedNode)?raw.selectedNode:s.nodes[0]?.id||null;
  s.stats={resets:integer(asObject(raw.stats).resets),clicks:integer(asObject(raw.stats).clicks)};
  // Existing v1.0 saves have no tutorialStep: keep established factories in the full game.
  s.onboarding=raw.onboarding===true || (raw.tutorialStep===undefined && s.nodes.length>2);
  s.tutorialStep=integer(raw.tutorialStep,s.onboarding?7:0,7);
  s.layouts=(Array.isArray(raw.layouts)?raw.layouts:[]).slice(0,5).map(layout=>({
    name:typeof layout?.name==='string'?layout.name.slice(0,32):'Saved layout',
    nodes:(Array.isArray(layout?.nodes)?layout.nodes:[]).slice(0,120).filter(n=>catalog.facilities[n.kind]).map(n=>({id:text(n.id),kind:n.kind,x:integer(n.x,0,1e7),y:integer(n.y,0,1e7)})),
    edges:(Array.isArray(layout?.edges)?layout.edges:[]).slice(0,260).map(e=>({from:text(e.from),to:text(e.to),resource:text(e.resource)}))
  }));
  s.nextId=Math.max(s.nextId,1+Math.max(0,...s.nodes.map(n=>Number(n.id.slice(1))||0)));
  normalizePowerEdges(s,catalog);
  return s;
}
function migrateV2(old) {
  const s=defaultState();
  s.credits=Math.max(250,number(old.parts,0,1e10));
  s.data=number(old.data,0,1e8);
  s.angels=integer(old.blueprints,0,1e5);
  s.totalAngels=Math.max(s.angels,integer(old.totalBlueprints));
  s.lifetimeRevenue=number(old.lifetimeParts,0,1e12);
  s.runRevenue=number(old.totalParts,0,1e12);
  s.xp=Math.floor(Math.sqrt(s.lifetimeRevenue)*12);
  const meta=asObject(old.meta);
  s.investments.capital=integer(meta.meta_start,0,12);
  s.investments.dividends=integer(meta.meta_mult,0,12);
  s.investments.infrastructure=integer(meta.meta_slots,0,12);
  s.stats.resets=integer(asObject(old.stats).prestiges);
  const established=operatingGraph();
  s.nodes=established.nodes;s.edges=established.edges;s.nextId=5;s.selectedNode='n3';
  s.onboarding=true;s.tutorialStep=7;
  s.lastSeen=number(old.lastSeen,Date.now(),1e15);
  return s;
}
export function loadLocal(catalog, storage=globalThis.localStorage) {
  for(const key of [SAVE_KEY,OLD_SAVE_KEY]){
    try{const raw=storage.getItem(key); if(raw)return {state:sanitizeSave(JSON.parse(raw),catalog),migrated:key!==SAVE_KEY};}
    catch(err){console.warn('Could not load save',key,err);}
  }
  return {state:defaultState(),migrated:false};
}
export function serializeSave(state){return JSON.stringify({...state,version:3,lastSeen:Date.now()});}
