/** Save schema v2. Do not serialize data catalogs or UI elements into saves. */
export function defaultState() {
  return {
    version: 2, parts: 0, totalParts: 0, lifetimeParts: 0,
    data: 0, totalData: 0, blueprints: 0, totalBlueprints: 0, power: 0,
    buildings: { generator: 1 }, upgrades: {}, research: {}, workers: [], meta: {},
    buyMode: 1, momentum: 0, momentumExpiry: 0,
    surgeUntil: 0, surgeCooldown: 0,
    lastClick: Date.now(), lastSeen: Date.now(),
    stats: { clicks: 0, playTime: 0, prestiges: 0 }
  };
}
function record(x) { return x !== null && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function numeric(value, fallback = 0, max = 1e300) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback;
}
function integer(value, fallback = 0, max = 1e6) { return Math.floor(numeric(value, fallback, max)); }
/** Strictly whitelist fields, IDs, numeric ranges and allowed enums. */
export function sanitize(raw, {BUILDINGS, RESEARCH, META, WORKER_CLASSES}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected JSON object');
  if (raw.version != null && raw.version > 2) throw new Error('Save version is newer than this game');
  const s = defaultState();
  for (const key of ['parts','totalParts','lifetimeParts','data','totalData','blueprints','totalBlueprints','power','momentum']) {
    s[key] = numeric(raw[key], s[key], key === 'momentum' ? 1 : 1e300);
  }
  for (const key of ['momentumExpiry','surgeUntil','surgeCooldown','lastClick','lastSeen']) {
    s[key] = numeric(raw[key], s[key], 1e15);
  }
  const bs = record(raw.buildings), ups = record(raw.upgrades);
  s.buildings = {};
  for (const id of Object.keys(BUILDINGS)) {
    const count = integer(bs[id], id === 'generator' && raw.buildings == null ? 1 : 0);
    if (count) s.buildings[id] = count;
    const lvl = integer(ups[id], 0, 1000);
    if (lvl) s.upgrades[id] = lvl;
  }
  const r = record(raw.research), m = record(raw.meta);
  for (const id of Object.keys(RESEARCH)) if (r[id] === true) s.research[id] = true;
  for (const [id, def] of Object.entries(META)) {
    const lvl = integer(m[id], 0, def.max);
    if (lvl) s.meta[id] = lvl;
  }
  const workers = Array.isArray(raw.workers) ? raw.workers : [];
  s.workers = workers.slice(0, 13).filter(w => w && typeof w === 'object').map(w => ({
    cls: WORKER_CLASSES[w.cls] ? w.cls : 'technician',
    level: integer(w.level, 1, 10000) || 1,
    xp: numeric(w.xp, 0, 1e8), assigned: w.assigned !== false
  }));
  s.buyMode = [1, 10, 'max'].includes(raw.buyMode) ? raw.buyMode : 1;
  const stats = record(raw.stats);
  for (const id of Object.keys(s.stats)) s.stats[id] = numeric(stats[id], 0, 1e300);
  return s;
}
