import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHudMetrics,renderHudHtml} from '../src/core/hud.js';

const fmt=n=>String(Number(n.toFixed(1)));
const money=n=>String(n)+' cr';
const catalog={facilities:{
  mine:{name:'Mine',unlock:0,slots:1},
  press:{name:'Precision Press',unlock:300,slots:2},
  lab:{name:'Research Lab',unlock:4000,slots:3}
}};
function state(extra={}){
  return {credits:250,runRevenue:200,xp:0,data:0,angels:0,nodes:[],investments:{},talents:{},...extra};
}
function grid(groupList){
  return {
    supply:groupList.reduce((sum,g)=>sum+g.supply,0),
    demand:groupList.reduce((sum,g)=>sum+g.demand,0),
    groups:new Map(groupList.map((g,i)=>[i,g]))
  };
}
const opts={fmt,money};

test('credits are a balance; revenue is earned this run and identifies the next unlock',()=>{
  const a=buildHudMetrics(state(),catalog,grid([{supply:28.8,demand:22}]),opts);
  assert.equal(a[0].value,'250 cr');
  assert.equal(a[1].value,'200 cr');
  assert.match(a[1].detail,/Precision Press at 300 cr/);
  assert.match(a[1].title,/Spending credits does not reduce revenue/);
  assert.equal(a[2].label,'FACTORY LEVEL');
  assert.equal(a[3].label,'RESEARCH DATA');
});

test('power shows demand/generation once, with spare only on the detail line',()=>{
  const a=buildHudMetrics(state(),catalog,grid([{supply:28.8,demand:22}]),opts);
  const power=a.find(x=>x.label.startsWith('POWER'));
  assert.equal(power.value,'22 / 28.8');
  assert.equal(power.detail,'6.8 spare');
  assert.equal(Math.round(power.progress),76);
  assert.equal(power.warning,false);
  const html=renderHudHtml([power]);
  assert.match(html,/metric-power-track/);
  assert.equal((html.match(/22 \/ 28\.8/g)||[]).length,1);
});

test('isolated deficits flag warnings even if the global sum has surplus',()=>{
  const a=buildHudMetrics(state(),catalog,grid([{supply:20,demand:10},{supply:2,demand:5}]),opts);
  const p=a.find(x=>x.label.startsWith('POWER'));
  assert.equal(p.warning,true);
  assert.match(p.detail,/1 grid short of power/);
  assert.doesNotMatch(p.detail,/spare/);
});

test('level progress explains XP and research is a different spendable currency',()=>{
  const a=buildHudMetrics(state({xp:60,data:12}),catalog,grid([]),opts);
  assert.equal(a[2].value,'2');
  assert.match(a[2].detail,/180 XP to level 3/);
  assert.equal(a[3].value,'12');
  assert.match(a[3].title,/not experience/);
});

test('tutorial shows a limited header and nav buttons are accessible after it',()=>{
  const g=grid([{supply:12,demand:1}]);
  const mini=buildHudMetrics(state(),catalog,g,{...opts,tutorial:true});
  assert.deepEqual(mini.map(x=>x.label),['CREDITS','RUN REVENUE','POWER · USED / GENERATED']);
  assert.doesNotMatch(renderHudHtml(mini),/data-tab=/);
  const regular=renderHudHtml(buildHudMetrics(state(),catalog,g,opts));
  assert.match(regular,/type="button" data-tab="management"/);
  assert.match(regular,/type="button" data-tab="research"/);
});

test('facility expansion milestone is shown after last machinery unlock',()=>{
  const a=buildHudMetrics(state({runRevenue:4500}),catalog,grid([]),opts);
  assert.match(a[1].detail,/Facility limits \+1\/type at 5000 cr/);
});
