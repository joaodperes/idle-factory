import { fmt, fmtTime } from "./core/format.js";
import { loadCatalogs } from "./core/catalog.js";
import { defaultState, sanitize } from "./core/save.js";
import { computePower as calcPower, computeProduction as calcProduction, applyPower, previewPowerEfficiency, prestigeReward as calcPrestige } from "./core/economy.js";
const { BUILDINGS, RESEARCH, META, WORKER_CLASSES } = await loadCatalogs();

/* =========================================================
   DEFINITIONS
   ========================================================= */








const SAVE_KEY = 'factory-idle-v2';
const HIRE_BASE = 150;

/* =========================================================
   STATE
   ========================================================= */
let state = defaultState();
const els = {};

/* =========================================================
   SAVE / LOAD
   ========================================================= */
function save(){
  state.lastSeen = Date.now();
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
  catch(e){ console.error("Save failed", e); toast("Could not save locally — export a backup JSON file."); return false; }
}
function load(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    state = sanitize(JSON.parse(raw), {BUILDINGS, RESEARCH, META, WORKER_CLASSES});
  }catch(e){ console.error('load failed', e); }
}

/* =========================================================
   HELPERS / MATH
   ========================================================= */
const hasResearch = id => !!state.research[id];

function totalSlots(){
  return 24 + 2*(state.meta.meta_slots||0) + (hasResearch('pr_slot')?8:0);
}
function usedSlots(){
  let s=0;
  for(const [id,b] of Object.entries(BUILDINGS)) s += (state.buildings[id]||0)*b.slots;
  return s;
}
function buildingCost(id){
  const b=BUILDINGS[id];
  return b.cost * Math.pow(b.scale, state.buildings[id]||0);
}
function upgradeCost(id){
  const b=BUILDINGS[id];
  return b.cost * 4 * Math.pow(1.6, state.upgrades[id]||0);
}
function hireCost(){ return HIRE_BASE * Math.pow(3, state.workers.length); }
function workerSlots(){ return 3 + (state.meta.meta_worker||0); }
function metaCost(id){
  const m = META[id];
  return Math.ceil(m.baseCost * Math.pow(m.scale, state.meta[id]||0));
}
function prestigeReward(){ return calcPrestige(state); }

function computePower(){ return calcPower(state, BUILDINGS); }

function computeProduction(){ return calcProduction(state, BUILDINGS); }

function clickValue(){
  let base = 1;
  if(hasResearch('oc_click')) base = 3 + 0.25*computeProduction().parts;
  return base;
}

/* =========================================================
   ACTIONS
   ========================================================= */
function floatText(x, y, text, color){
  const el = document.createElement('div');
  el.className = 'float';
  el.style.left = x+'px';
  el.style.top = y+'px';
  el.style.color = color || '#3fb950';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1000);
}

function doClick(e){
  let mult = 1;
  if(hasResearch('oc_crit') && Math.random()<0.1) mult = 10;
  const gain = clickValue() * mult;
  state.parts += gain;
  state.totalParts += gain;
  state.lifetimeParts += gain;
  state.stats.clicks++;
  state.lastClick = Date.now();
  if(hasResearch('oc_mom')){
    state.momentum = Math.min(1, state.momentum + 0.01);
    state.momentumExpiry = Date.now() + 20000;
  }
  const x = e && e.clientX ? e.clientX : window.innerWidth/2;
  const y = e && e.clientY ? e.clientY : window.innerHeight/2;
  floatText(x, y, (mult>1?'CRIT +':'+') + fmt(gain), mult>1?'#f0b429':'#3fb950');
}

function doSurge(){
  const now = Date.now();
  if(now < state.surgeCooldown || now < state.surgeUntil) return;
  state.surgeUntil = now + 10000;
  state.surgeCooldown = now + 60000;
  toast('⚡ SURGE ACTIVATED');
}

function buyBuilding(id){
  const b = BUILDINGS[id];
  if(state.totalParts < b.unlock) return;
  const mode = state.buyMode;
  let remaining = mode === 'max' ? Infinity : (mode === 1 ? 1 : 10);
  let bought = 0;
  while(remaining > 0){
    const cost = buildingCost(id);
    if(state.parts < cost) break;
    if(usedSlots() + b.slots > totalSlots()){ if(bought===0) toast('No free slots!'); break; }
    state.parts -= cost;
    state.buildings[id] = (state.buildings[id]||0) + 1;
    bought++;
    remaining--;
  }
}

function sellBuilding(id){
  const building = BUILDINGS[id];
  const count = state.buildings[id] || 0;
  if(!building || count <= 0) return;
  const lastPaid = building.cost * Math.pow(building.scale, count - 1);
  const refund = Math.floor(lastPaid * 0.5);
  state.buildings[id] = count - 1;
  state.parts += refund;
  toast(`Sold ${building.name}: +${fmt(refund)} parts (50% refund)`);
}

function upgradeBuilding(id){
  const cost = upgradeCost(id);
  if(state.parts < cost) return;
  if(!(state.buildings[id] > 0)) return;
  state.parts -= cost;
  state.upgrades[id] = (state.upgrades[id]||0) + 1;
}

function research(id){
  const node = RESEARCH[id];
  if(hasResearch(id)) return;
  if(!node.req.every(r=>hasResearch(r))) return;
  if(state.data < node.cost) return;
  state.data -= node.cost;
  state.research[id] = true;
  toast('Researched: ' + node.name);
}

function hire(cls){
  if(state.workers.length >= workerSlots()) return;
  const cost = hireCost();
  if(state.parts < cost) return;
  state.parts -= cost;
  state.workers.push({cls, level:1, xp:0, assigned:true});
  buildWorkers();
}
function toggleWorker(i){
  if(state.workers[i]) state.workers[i].assigned = !state.workers[i].assigned;
}
function fireWorker(i){
  state.workers.splice(i,1);
  buildWorkers();
}

function buyMeta(id){
  const m = META[id];
  const lvl = state.meta[id]||0;
  if(lvl >= m.max) return;
  const cost = metaCost(id);
  if(state.blueprints < cost) return;
  state.blueprints -= cost;
  state.meta[id] = lvl+1;
}

function prestigeReset(){
  const earned = prestigeReward();
  if(earned <= 0) return;
  if(!confirm(`Rebuild factory for ${earned} Blueprints?`)) return;
  const keepData = Math.floor(state.data * 0.2 * (state.meta.meta_keep||0));
  const newState = defaultState();
  newState.meta = state.meta;
  newState.blueprints = state.blueprints + earned;
  newState.totalBlueprints = state.totalBlueprints + earned;
  newState.stats = state.stats;
  newState.stats.prestiges = (state.stats.prestiges||0) + 1;
  newState.lifetimeParts = state.lifetimeParts;
  newState.data = keepData;
  newState.totalData = state.totalData;
  newState.parts = 100 * (state.meta.meta_start||0);
  newState.buildings = { generator:1 + (state.meta.meta_start||0) };
  state = newState;
  buildWorkers();
  save();
  toast('Factory rebuilt! +' + earned + ' Blueprints');
}

function exportSave(){
  document.getElementById('save-text').value = JSON.stringify(state);
  toast('Exported to text box');
}
function importSave(text){
  const txt = (typeof text === 'string' ? text : document.getElementById('save-text').value).trim();
  if(!txt){ toast('Paste a save first'); return; }
  try{
    const candidate = sanitize(JSON.parse(txt), {BUILDINGS, RESEARCH, META, WORKER_CLASSES});
    state = candidate;
    offlineProgress();
    buildAll();
    save();
    toast('Save imported');
  }catch(e){ toast('Invalid save'); }
}
function downloadSaveFile(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `factory-idle-save-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function hardReset(){
  if(!confirm('Wipe ALL progress permanently?')) return;
  localStorage.removeItem(SAVE_KEY);
  state = defaultState();
  buildAll();
  save();
}

/* =========================================================
   GAME LOOP
   ========================================================= */
function autoBuy(id){
  if(id === 'generator'){
    const {gen,demand} = computePower();
    if(gen >= demand) return;
  }
  const b = BUILDINGS[id];
  const cost = buildingCost(id);
  if(state.parts < cost) return;
  if(usedSlots() + b.slots > totalSlots()) return;
  state.parts -= cost;
  state.buildings[id] = (state.buildings[id]||0) + 1;
}

function tick(dt){
  const now = Date.now();
  if(state.momentum > 0 && now > state.momentumExpiry) state.momentum = 0;

  const powerEff = applyPower(state, computePower(), dt);

  const prod = computeProduction();
  const gainParts = prod.parts * powerEff * dt;
  const gainData  = prod.data  * powerEff * dt;
  state.parts += gainParts;
  state.totalParts += gainParts;
  state.lifetimeParts += gainParts;
  state.data += gainData;
  state.totalData += gainData;
  state.stats.playTime += dt;

  for(const w of state.workers){
    if(!w.assigned) continue;
    w.xp += dt * 5;
    while(w.xp >= 100*w.level){
      w.xp -= 100*w.level;
      w.level++;
    }
  }

  if(hasResearch('auto_gen')) autoBuy('generator');
  if(hasResearch('auto_asm')) autoBuy('assembler');

  state.lastSeen = now;
}

let lastTickTime = Date.now();
setInterval(()=>{
  const now = Date.now();
  const dt = Math.max(0, Math.min(8 * 3600, (now-lastTickTime)/1000));
  lastTickTime = now;
  tick(dt);
  updateHeader();
  updateActiveTab();
}, 100);

setInterval(save, 10000);
window.addEventListener('beforeunload', save);

/* =========================================================
   OFFLINE PROGRESS
   ========================================================= */
function offlineProgress(){
  if(!hasResearch('auto_offline')) return;
  const away = (Date.now() - (state.lastSeen||Date.now())) / 1000;
  if(away < 60) return;
  const capped = Math.min(away, 8*3600);
  const prod = computeProduction();
  const powerEff = applyPower(state, computePower(), capped);
  const pGain = prod.parts * 0.5 * powerEff * capped;
  const dGain = prod.data  * 0.5 * powerEff * capped;
  state.parts += pGain;
  state.totalParts += pGain;
  state.lifetimeParts += pGain;
  state.data += dGain;
  state.totalData += dGain;
  if(pGain > 1 || dGain > 1){
    setTimeout(()=>toast(`Offline ${fmtTime(capped)}: +${fmt(pGain)} parts, +${fmt(dGain)} data`), 400);
  }
}

/* =========================================================
   RENDERING — BUILD
   ========================================================= */
function buildFactory(){
  const c = document.getElementById('buildings');
  c.innerHTML = '';
  els.bld = {};
  for(const [id,b] of Object.entries(BUILDINGS)){
    const row = document.createElement('div');
    row.className = 'building';
    row.innerHTML =
      `<div class="b-info">
        <div class="b-name">${b.name}<span class="b-count" data-ref="count">0</span></div>
        <div class="b-desc" data-ref="desc"></div>
      </div>
      <div class="b-actions">
        <button class="buy" data-action="buy" data-id="${id}" data-ref="buy">Buy</button>
        <button class="up" data-action="upgrade" data-id="${id}" data-ref="up">Upgrade</button>
        <button class="sell" data-action="sell" data-id="${id}" data-ref="sell">Sell</button>
      </div>`;
    c.appendChild(row);
    els.bld[id] = {
      row,
      count: row.querySelector('[data-ref=count]'),
      desc: row.querySelector('[data-ref=desc]'),
      buy: row.querySelector('[data-ref=buy]'),
      up: row.querySelector('[data-ref=up]'),
      sell: row.querySelector('[data-ref=sell]'),
    };
  }
}

function buildResearch(){
  const c = document.getElementById('branches');
  c.innerHTML = '';
  els.res = {};
  const order = ['auto','oc','pr'];
  const titles = {auto:'Automation', oc:'Overclock', pr:'Precision'};
  for(const br of order){
    const div = document.createElement('div');
    div.className = 'branch';
    const h = document.createElement('h3');
    h.textContent = titles[br];
    div.appendChild(h);
    for(const [id,node] of Object.entries(RESEARCH)){
      if(node.branch !== br) continue;
      const nd = document.createElement('div');
      nd.className = 'node';
      nd.innerHTML =
        `<div class="node-name">${node.name}</div>
         <div class="node-desc">${node.desc}</div>
         <button data-action="research" data-id="${id}"></button>`;
      div.appendChild(nd);
      els.res[id] = { node: nd, btn: nd.querySelector('button') };
    }
    c.appendChild(div);
  }
}

function buildWorkers(){
  const hireRow = document.getElementById('hire-row');
  hireRow.innerHTML =
    `<button data-action="hire" data-id="technician" data-ref="tech"></button>
     <button data-action="hire" data-id="engineer" data-ref="eng"></button>
     <button data-action="hire" data-id="scientist" data-ref="sci"></button>`;
  els.hireBtns = {
    technician: hireRow.querySelector('[data-ref=tech]'),
    engineer: hireRow.querySelector('[data-ref=eng]'),
    scientist: hireRow.querySelector('[data-ref=sci]'),
  };

  const list = document.getElementById('workers');
  list.innerHTML = '';
  els.workers = [];
  state.workers.forEach((w, i) => {
    const div = document.createElement('div');
    div.className = 'worker';
    div.innerHTML =
      `<div class="w-top">
        <span class="w-name ${w.cls}">${WORKER_CLASSES[w.cls].name} #${i+1}</span>
        <span class="w-lvl">Lv ${w.level}</span>
      </div>
      <div class="w-xp"><div class="w-xp-bar"></div></div>
      <div class="w-bottom">
        <span class="w-bonus"></span>
        <div style="display:flex;gap:6px">
          <button data-action="toggle-worker" data-id="${i}" data-ref="toggle"></button>
          <button data-action="fire-worker" data-id="${i}">Fire</button>
        </div>
      </div>`;
    list.appendChild(div);
    els.workers.push({
      lvl: div.querySelector('.w-lvl'),
      bar: div.querySelector('.w-xp-bar'),
      bonus: div.querySelector('.w-bonus'),
      toggle: div.querySelector('[data-ref=toggle]'),
    });
  });
}

function buildMeta(){
  const c = document.getElementById('meta-list');
  c.innerHTML = '';
  els.meta = {};
  for(const [id,m] of Object.entries(META)){
    const div = document.createElement('div');
    div.className = 'meta';
    div.innerHTML =
      `<div class="m-info">
        <div class="m-name">${m.name} <span class="m-lvl"></span></div>
        <div class="m-desc">${m.desc}</div>
      </div>
      <button data-action="buy-meta" data-id="${id}"></button>`;
    c.appendChild(div);
    els.meta[id] = {
      lvl: div.querySelector('.m-lvl'),
      btn: div.querySelector('button'),
    };
  }
}

function buildAll(){
  buildFactory();
  buildResearch();
  buildWorkers();
  buildMeta();
  updateHeader();
  updateActiveTab();
}

/* =========================================================
   RENDERING — UPDATE
   ========================================================= */
function updateHeader(){
  const {gen, demand, storage} = computePower();
  const prod = computeProduction();
  const eff = previewPowerEfficiency(state, {gen, demand, storage}, 1);
  document.getElementById('r-parts').textContent = fmt(state.parts);
  document.getElementById('r-parts-rate').textContent = '+' + fmt(prod.parts * eff) + '/s';
  document.getElementById('r-data').textContent = fmt(state.data);
  document.getElementById('r-data-rate').textContent = '+' + fmt(prod.data * eff) + '/s';
  document.getElementById('r-power').textContent = fmt(gen) + ' / ' + fmt(demand);
  document.getElementById('r-power-store').textContent = fmt(state.power) + ' / ' + fmt(storage) + ' stored';
  document.getElementById('r-slots').textContent = usedSlots() + ' / ' + totalSlots();
  document.getElementById('r-bp').textContent = fmt(state.blueprints);
  document.getElementById('craft-val').textContent = '+' + fmt(clickValue());

  const surge = document.getElementById('surge-btn');
  if(hasResearch('oc_surge')){
    surge.hidden = false;
    const now = Date.now();
    if(now < state.surgeUntil){
      surge.textContent = 'SURGING ' + Math.ceil((state.surgeUntil-now)/1000) + 's';
      surge.disabled = true;
    } else if(now < state.surgeCooldown){
      surge.textContent = 'CD ' + Math.ceil((state.surgeCooldown-now)/1000) + 's';
      surge.disabled = true;
    } else {
      surge.textContent = '⚡ SURGE';
      surge.disabled = false;
    }
  } else {
    surge.hidden = true;
  }
}

function buildingDescText(b){
  const p = [];
  if(b.power) p.push(`⚡${b.power>0?'+':''}${b.power}`);
  if(b.out) p.push(`+${b.out} p/s`);
  if(b.data) p.push(`+${b.data} d/s`);
  if(b.storage) p.push(`+${b.storage} storage`);
  p.push(`${b.slots} slot${b.slots>1?'s':''}`);
  return b.desc + ' · ' + p.join(' · ');
}

function bulkCost(id, n){
  const b = BUILDINGS[id];
  const cur = state.buildings[id]||0;
  let total = 0;
  for(let i=0;i<n;i++) total += b.cost * Math.pow(b.scale, cur+i);
  return total;
}
function displayCost(id){
  if(state.buyMode === 'max') return 'MAX';
  if(state.buyMode === 1) return fmt(buildingCost(id));
  return fmt(bulkCost(id, 10));
}
function canAffordMode(id){
  if(state.buyMode === 'max') return state.parts >= buildingCost(id);
  const n = state.buyMode === 1 ? 1 : 10;
  return state.parts >= bulkCost(id, n);
}

function updateFactory(){
  for(const [id,b] of Object.entries(BUILDINGS)){
    const e = els.bld[id]; if(!e) continue;
    const n = state.buildings[id]||0;
    const u = state.upgrades[id]||0;
    const unlocked = state.totalParts >= b.unlock;
    e.row.classList.toggle('locked', !unlocked);
    e.count.textContent = n;
    const upCost = upgradeCost(id);
    const slotOK = usedSlots() + b.slots <= totalSlots();
    e.desc.textContent = unlocked ? buildingDescText(b) : `Unlocks at ${fmt(b.unlock)} total parts`;
    e.buy.textContent = unlocked ? 'Buy ' + displayCost(id) : '🔒';
    e.buy.disabled = !unlocked || !canAffordMode(id) || !slotOK;
    e.up.textContent = `Upg ${fmt(upCost)}${u?' ('+u+')':''}`;
    e.up.disabled = n===0 || state.parts < upCost;
    e.sell.disabled = n===0;
  }
  document.querySelectorAll('[data-action=buymode]').forEach(btn=>{
    const v = btn.dataset.id === 'max' ? 'max' : +btn.dataset.id;
    btn.classList.toggle('active', state.buyMode === v);
  });
}

function updateResearch(){
  for(const [id,node] of Object.entries(RESEARCH)){
    const e = els.res[id]; if(!e) continue;
    const owned = hasResearch(id);
    const reqMet = node.req.every(r=>hasResearch(r));
    const available = !owned && reqMet && state.data >= node.cost;
    e.node.classList.toggle('owned', owned);
    e.node.classList.toggle('available', available);
    e.node.classList.toggle('locked', !owned && !reqMet);
    if(owned){
      e.btn.textContent = '✓ Researched';
      e.btn.disabled = true;
    } else if(!reqMet){
      e.btn.textContent = '🔒 Needs ' + node.req.map(r=>RESEARCH[r].name).join(', ');
      e.btn.disabled = true;
    } else {
      e.btn.textContent = 'Research · ' + fmt(node.cost) + ' Data';
      e.btn.disabled = state.data < node.cost;
    }
  }
}

function updateWorkers(){
  if(!els.hireBtns) return;
  const hc = hireCost();
  const full = state.workers.length >= workerSlots();
  for(const cls of Object.keys(WORKER_CLASSES)){
    const b = els.hireBtns[cls]; if(!b) continue;
    b.textContent = full
      ? 'Worker slots full'
      : `Hire ${WORKER_CLASSES[cls].name} · ${fmt(hc)}`;
    b.disabled = full || state.parts < hc;
  }
  state.workers.forEach((w, i) => {
    const e = els.workers[i]; if(!e) return;
    e.lvl.textContent = `Lv ${w.level}`;
    const need = 100 * w.level;
    e.bar.style.width = Math.min(100, (w.xp/need)*100) + '%';
    const pct = (2*w.level).toFixed(0);
    e.bonus.textContent = w.assigned
      ? `+${pct}% ${WORKER_CLASSES[w.cls].bonus} (assigned)`
      : 'Unassigned';
    e.toggle.textContent = w.assigned ? 'Unassign' : 'Assign';
  });
}

function updatePrestige(){
  const earned = prestigeReward();
  document.getElementById('p-total').textContent = fmt(state.totalParts);
  document.getElementById('p-bp').textContent = fmt(earned);
  const btn = document.getElementById('p-btn');
  btn.textContent = earned > 0 ? `Rebuild for ${fmt(earned)} BP` : 'Need 10K total parts';
  btn.disabled = earned <= 0;
  for(const [id,m] of Object.entries(META)){
    const e = els.meta[id]; if(!e) continue;
    const lvl = state.meta[id]||0;
    e.lvl.textContent = `${lvl}/${m.max}`;
    if(lvl >= m.max){
      e.btn.textContent = 'MAX';
      e.btn.disabled = true;
    } else {
      const cost = metaCost(id);
      e.btn.textContent = `${fmt(cost)} BP`;
      e.btn.disabled = state.blueprints < cost;
    }
  }
}

function updateSettings(){
  document.getElementById('s-clicks').textContent = fmt(state.stats.clicks);
  document.getElementById('s-time').textContent = fmtTime(state.stats.playTime);
  document.getElementById('s-lifetime').textContent = fmt(state.lifetimeParts);
  document.getElementById('s-prestiges').textContent = state.stats.prestiges||0;
}

function updateActiveTab(){
  const tab = document.querySelector('.tab.active');
  if(!tab) return;
  const id = tab.id.replace('tab-','');
  if(id === 'factory') updateFactory();
  else if(id === 'research') updateResearch();
  else if(id === 'workers') updateWorkers();
  else if(id === 'prestige') updatePrestige();
  else if(id === 'settings') updateSettings();
}

/* =========================================================
   UI HELPERS
   ========================================================= */
let toastTimer = null;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* =========================================================
   EVENT WIRING
   ========================================================= */
document.querySelectorAll('nav button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('tab-'+b.dataset.tab).classList.add('active');
    updateActiveTab();
  });
});

document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  switch(action){
    case 'craft':           doClick(e); break;
    case 'surge':           doSurge(); break;
    case 'buymode':
      state.buyMode = id === 'max' ? 'max' : +id;
      break;
    case 'buy':             buyBuilding(id); break;
    case 'upgrade':         upgradeBuilding(id); break;
    case 'research':        research(id); break;
    case 'hire':            hire(id); break;
    case 'toggle-worker':   toggleWorker(+id); break;
    case 'fire-worker':     fireWorker(+id); break;
    case 'buy-meta':        buyMeta(id); break;
    case 'prestige':        prestigeReset(); break;
    case 'save':            if(save()) toast('Saved'); break;
    case 'export':          exportSave(); break;
    case 'import':          importSave(); break;
    case 'export-file':     downloadSaveFile(); break;
    case 'import-file':     document.getElementById('save-file-input').click(); break;
    case 'sell':            sellBuilding(id); break;
    case 'hard-reset':      hardReset(); break;
  }
  updateHeader();
  updateActiveTab();
});

/* =========================================================
   INIT
   ========================================================= */
document.getElementById('save-file-input').addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try { importSave(await file.text()); }
  catch(err) { console.error(err); toast('Failed to read save file'); }
  e.target.value = '';
});

load();
offlineProgress();
buildAll();
save();
