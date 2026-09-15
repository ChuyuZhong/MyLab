import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCount,poolAvailability,assertOwner,safeTask,parseMonitor,submit} from '../scripts/gpu-control.mjs';
test('GPU counts accept zero and capacity but reject excess, fractional and string input',()=>{
 assert.equal(validateCount(0,0),0);assert.equal(validateCount(3,3),3);
 for(const value of [-1,4,0.5,'0',null,NaN,Infinity])assert.throws(()=>validateCount(value,3));
});
test('capacity excludes CPU, other pools, allocated and disabled CUDA slots',()=>{
 const slot={enabled:true,device:{type:'TYPE_CUDA'}};
 const agents=[{enabled:true,resourcePools:['a'],slots:{a:slot,b:{...slot,container:{}},c:{...slot,draining:true},d:{...slot,device:{type:'TYPE_CPU'}}}},{enabled:false,resourcePools:['a'],slots:{a:slot}},{enabled:true,resourcePools:['b'],slots:{a:slot}}];
 assert.equal(poolAvailability(agents,'a'),1);assert.equal(poolAvailability(agents,'unknown'),0);
});
test('task ownership and redaction prevent private keys or other owners reaching UI',()=>{
 assert.throws(()=>assertOwner({username:'other'},'me'));
 assert.doesNotThrow(()=>assertOwner({username:'me'},'me'));
 assert.equal('privateKey' in safeTask({privateKey:'secret',container:{devices:[{type:'TYPE_CUDA',id:2}]}}),false);
});
test('monitor ignores prefix, preserves both per-card groups, zeros and metadata',()=>{
 const headers=['taskid','max_days','start_time','log_time','gpu_memory (GB)','gpu_utilization (%)'];
 const cells=['task-1','7','2026-09-15 10:00:00','2026-09-15 10:01:00','[10,[0,2.3],[1.2,3.4]]','[10,[0,99],[12,34]]'];
 const html='<table><thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody><tr>'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr></tbody></table>';
 const [r]=parseMonitor(html);assert.equal(r.maxDays,'7');assert.equal(r.taskId,'task-1');assert.deepEqual(r.memory,[[0,2.3],[1.2,3.4]]);assert.deepEqual(r.utilization,[[0,99],[12,34]]);
});
test('submission rejects over-capacity before reading config or executing commands',async()=>{
 await assert.rejects(submit({key:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',pool:'s3-4090',count:1},{username:'test',token:'test'},async()=>[{enabled:true,resourcePools:['s3-4090'],slots:{}}]),/0 至 0/);
});
