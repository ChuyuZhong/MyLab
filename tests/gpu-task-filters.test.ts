import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesTaskFilters,taskFilterOptions,taskValue} from '../src/gpu-task-filters.ts';
const tasks=[{id:'a',description:'training',user:'alice',state:'RUNNING',pool:'4090',startTime:'2026-09-18T09:00:00+08:00'},{id:'b',description:'training',user:'bob',state:'QUEUED',pool:'a800',startTime:''}];
test('column filters combine across columns while preserving all vs no selections',()=>{
 assert.equal(tasks.filter(t=>matchesTaskFilters(t,{})).length,2);
 assert.deepEqual(tasks.filter(t=>matchesTaskFilters(t,{state:['RUNNING','QUEUED'],user:['alice']})).map(t=>t.id),['a']);
 assert.equal(tasks.filter(t=>matchesTaskFilters(t,{user:[]})).length,0);
 assert.equal(tasks.filter(t=>matchesTaskFilters(t,{user:null})).length,2);
 assert.equal(matchesTaskFilters(tasks[0],{id:['b']}),false);
});
test('options distinguish equal task names and retain selected values after refresh',()=>{
 assert.equal(taskFilterOptions(tasks,'id').length,2);
 assert.ok(taskFilterOptions(tasks,'user',['missing']).some(o=>o.value==='missing'));
 assert.equal(taskValue(tasks[1],'startTime'),'');
 const d=new Date(tasks[0].startTime);
 assert.equal(taskValue(tasks[0],'startTime'),`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`);
});
