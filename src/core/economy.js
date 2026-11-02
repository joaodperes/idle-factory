/** Game mechanics, independent from the DOM. */
export function workerBonus(state, cls) {
  return state.workers.reduce((sum, w) => sum + (w.assigned && w.cls === cls ? 0.02 * w.level : 0), 0);
}
export function computePower(state, buildings) {
  let gen = 0, demand = 0, storage = 0;
  for (const [id, b] of Object.entries(buildings)) {
    const n = state.buildings[id] || 0;
    if (!n) continue;
    const mult = 1 + 0.3 * (state.upgrades[id] || 0);
    if (b.power > 0) gen += n * b.power * mult;
    else if (b.power < 0) demand += n * (-b.power);
    if (b.storage) storage += n * b.storage * mult;
  }
  if (state.research.auto_eff) gen *= 1.3;
  if (state.research.pr_save) demand *= 0.8;
  if (state.research.oc_over) demand *= 1.4;
  gen *= 1 + workerBonus(state, 'engineer');
  return { gen, demand, storage };
}
export function computeProduction(state, buildings, now = Date.now()) {
  let parts = 0, data = 0;
  for (const [id, b] of Object.entries(buildings)) {
    const n = state.buildings[id] || 0;
    if (!n) continue;
    const mult = 1 + 0.3 * (state.upgrades[id] || 0);
    parts += n * b.out * mult;
    data += n * b.data * mult;
  }
  let pm = 1, dm = 1;
  if (state.research.pr_qual) { pm *= 1.15; dm *= 1.15; }
  if (state.research.pr_mast) { pm *= 2; dm *= 2; }
  if (state.research.oc_over) { pm *= 1.6; dm *= 1.6; }
  if (state.research.pr_syn) {
    const types = Object.values(state.buildings).filter(n => n > 0).length;
    pm *= 1 + 0.03 * types;
    dm *= 1 + 0.03 * types;
  }
  pm *= 1 + workerBonus(state, 'technician');
  dm *= 1 + workerBonus(state, 'scientist');
  const momentum = 1 + state.momentum;
  pm *= momentum; dm *= momentum;
  if (state.research.auto_idle && now - state.lastClick > 180000) { pm *= 1.5; dm *= 1.5; }
  if (now < state.surgeUntil) { pm *= 2; dm *= 2; }
  const legacy = 1 + 0.1 * (state.meta.meta_mult || 0);
  pm *= legacy; dm *= legacy;
  return { parts: parts * pm, data: data * dm };
}
/** Estimate the fraction of power demand covered over a period, including capacitors. */
export function previewPowerEfficiency(state, {gen, demand}, seconds) {
  if (demand <= 0) return 1;
  if (gen >= demand) return 1;
  if (seconds <= 0) return gen / demand;
  const drawn = Math.min(Math.max(0, state.power), (demand - gen) * seconds);
  return Math.min(1, Math.max(0, (gen * seconds + drawn) / (demand * seconds)));
}
/** Advance energy storage and return effective load fraction for production. */
export function applyPower(state, power, seconds) {
  const efficiency = previewPowerEfficiency(state, power, seconds);
  const {gen, demand, storage} = power;
  if (gen >= demand) state.power = Math.min(storage, Math.max(0, state.power) + (gen - demand) * seconds);
  else state.power = Math.max(0, state.power - Math.min(state.power, (demand - gen) * seconds));
  return efficiency;
}
export function prestigeReward(state) {
  return state.totalParts < 10000 ? 0 : Math.floor(Math.sqrt(state.totalParts / 10000));
}
