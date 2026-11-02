import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionsForMachine,connectionAppearance,validLinkFocus} from '../src/core/link-focus.js';
const edges=[
  {id:'e1',from:'n1',to:'n3',resource:'power'},
  {id:'e2',from:'n1',to:'n3',resource:'power'},
  {id:'e3',from:'n2',to:'n3',resource:'metal'},
  {id:'e4',from:'n5',to:'n6',resource:'ore'}
];
test('connection list includes incoming and outgoing links by unique ID, even when paths coincide',()=>{
  assert.deepEqual(connectionsForMachine(edges,'n1').map(e=>e.id),['e1','e2']);
  assert.deepEqual(connectionsForMachine(edges,'n3').map(e=>e.id),['e1','e2','e3']);
  assert.deepEqual(connectionsForMachine(edges,'missing'),[]);
});
test('machine focus dims unrelated lines without hiding selected incident links',()=>{
  assert.deepEqual(connectionAppearance(edges[0],'n1',null,true),{related:true,focused:false,dimmed:false});
  assert.equal(connectionAppearance(edges[3],'n1',null,true).dimmed,true);
  assert.equal(connectionAppearance(edges[3],'n1',null,false).dimmed,false);
  assert.equal(connectionAppearance(edges[3],null,null,true).dimmed,false);
});
test('a specific link can be brought forward even when another shares the same endpoints',()=>{
  assert.deepEqual(connectionAppearance(edges[1],'n1','e2',true),{related:true,focused:true,dimmed:false});
  assert.equal(connectionAppearance(edges[0],'n1','e2',true).dimmed,true);
  assert.equal(connectionAppearance(edges[3],'n1','e2',false).dimmed,true);
});
test('link focus is discarded when switching machines or after disconnecting',()=>{
  assert.equal(validLinkFocus(edges,'e2','n3'),'e2');
  assert.equal(validLinkFocus(edges,'e2','n6'),null);
  assert.equal(validLinkFocus(edges.filter(e=>e.id!=='e2'),'e2','n1'),null);
});
