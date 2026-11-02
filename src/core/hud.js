import {usedSlots,totalSlots,nextCapacityMilestone} from './graph.js';
import {factoryLevel,nextFactoryLevelXp,freeTalentPoints,TALENT_UNLOCK_LEVEL} from './talents.js';

/**
 * Single source of truth for the header: balance, earned progress, XP,
 * research currency and independent power grids must never be conflated.
 * This module has no DOM dependency, so HUD behavior is regression-testable.
 */
export function buildHudMetrics(state,catalog,grid,{fmt,money,tutorial=false}){
  const groups=[...(grid.groups?.values()||[])];
  const supply=Math.max(0,grid.supply||0),demand=Math.max(0,grid.demand||0);
  const shortageGroups=groups.filter(g=>g.demand>g.supply+0.000001);
  const spare=groups.length
    ? groups.reduce((sum,g)=>sum+Math.max(0,g.supply-g.demand),0)
    : Math.max(0,supply-demand);
  const powerNote=shortageGroups.length
    ? String(shortageGroups.length)+' grid'+(shortageGroups.length===1?'':'s')+' short of power'
    : fmt(spare)+' spare';
  const power={
    label:'POWER · USED / GENERATED',
    value:fmt(demand)+' / '+fmt(supply),
    detail:shortageGroups.length?'⚠ '+powerNote:powerNote,
    title:'Power demand / total generation. Each disconnected electrical grid is evaluated separately. Spare generation on one grid cannot power another grid.',
    tab:'factory',
    warning:shortageGroups.length>0||demand>supply+0.000001,
    progress:supply>0?Math.min(100,100*demand/supply):demand>0?100:0
  };
  const pending=Object.values(catalog.facilities||{}).filter(f=>Number.isFinite(f.unlock)&&f.unlock>state.runRevenue)
    .map(f=>({name:f.name,threshold:f.unlock})).sort((a,b)=>a.threshold-b.threshold);
  const cap=nextCapacityMilestone(state);
  if(cap!==null)pending.push({name:'Facility limits +1/type',threshold:cap});
  pending.sort((a,b)=>a.threshold-b.threshold);
  const goal=pending[0];
  const credits={
    label:'CREDITS',value:money(state.credits),
    detail:'Spendable balance',
    title:'Money you currently own. Sales and contract rewards increase it; building and upgrading machines spend it.',
    tab:'factory'
  };
  const revenue={
    label:'RUN REVENUE',value:money(state.runRevenue),
    detail:goal?'Next: '+goal.name+' at '+money(goal.threshold):'All run-revenue unlocks reached',
    title:'Total earned by this company so far, not money still available. Spending credits does not reduce revenue. Revenue unlocks machines and facility limits and contributes to angel rewards.',
    tab:'factory'
  };
  if(tutorial)return [credits,revenue,power].map(m=>({...m,tab:null}));
  const level=factoryLevel(state),nextXp=nextFactoryLevelXp(state),free=freeTalentPoints(state);
  const levelNote=nextXp===null?'Maximum level reached'
    :fmt(Math.max(0,nextXp-state.xp))+' XP to level '+(level+1);
  return [
    credits,
    revenue,
    {
      label:'FACTORY LEVEL',value:String(level),
      detail:levelNote+(free?' · '+free+' talent point'+(free===1?'':'s')+' free':level<TALENT_UNLOCK_LEVEL?' · Talents at Lv '+TALENT_UNLOCK_LEVEL:''),
      title:'Factory XP comes from sales (base 12% of earnings), contracts and talent bonuses. XP raises Factory Level, which grants industrial capacity and talent points. Unlike run revenue, XP persists across investor resets.',
      tab:'management'
    },
    {
      label:'RESEARCH DATA',value:fmt(state.data),
      detail:'Spend on technology',
      title:'Research Data is a separate spendable currency produced by powered Research Labs supplied with Devices. It is not experience, revenue or credits.',
      tab:'research'
    },
    power,
    {
      label:'CAPACITY',value:fmt(usedSlots(state,catalog))+' / '+fmt(totalSlots(state)),
      detail:'Industrial slots used',
      title:'Global industrial capacity. Expand by gaining Factory Levels, investing angel points or choosing capacity talents.',
      tab:'factory'
    },
    {
      label:'ANGELS',value:fmt(state.angels),
      detail:'Permanent investments',
      title:'Angel investors earned by restarting a successful company. Spend angels on permanent upgrades that persist across future runs.',
      tab:'investors'
    }
  ];
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** Buttons are navigable with keyboard, not just hover-only tooltips. */
export function renderHudHtml(metrics){
  return metrics.map(m=>{
    const tag=m.tab?'button':'div';
    const attrs=' class="metric'+(m.warning?' metric-warning':'')+(m.tab?' metric-action':'')+'"'
      +' title="'+escapeHtml(m.title)+'"'
      +(m.tab?' type="button" data-tab="'+escapeHtml(m.tab)+'"':'');
    const bar=m.progress===undefined?''
      :'<div class="metric-power-track" role="progressbar" aria-label="Power demand as percentage of generation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(m.progress)+'"><span style="width:'+m.progress.toFixed(1)+'%"></span></div>';
    return '<'+tag+attrs+'><small>'+escapeHtml(m.label)+'</small><strong>'+escapeHtml(m.value)+'</strong>'+bar
      +(m.detail?'<small class="metric-note">'+escapeHtml(m.detail)+'</small>':'')+'</'+tag+'>';
  }).join('');
}
