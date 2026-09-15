import test from 'node:test';
import assert from 'node:assert/strict';
import {validConfigName,parseMetricSeries,gpuMetrics,startGpuShell} from '../scripts/gpu-local.mjs';
test('GPU config selection rejects traversal and shell syntax',()=>{
 assert.equal(validConfigName('zcy_task_a800.yaml'),true);
 for(const s of ['../a.yaml','C:\\a.yaml','a.yaml;whoami','a.yaml\n','a.exe','/a.yaml'])assert.equal(validConfigName(s),false);
});
test('GPU metrics keep real zero values and discard invalid sentinel values',()=>{
 assert.deepEqual(parseMetricSeries([{values:[[2,'NaN'],[1,'0'],[3,'9.22e18'],[4,'42']]}]),[{time:1000,value:0},{time:4000,value:42}]);
 assert.deepEqual(parseMetricSeries([]),[]);
});
test('GPU operations reject unauthenticated submission and invalid GPU identity before requests',async()=>{
 await assert.rejects(startGpuShell({},{}),/登录/);
 await assert.rejects(gpuMetrics('GPU-x"}'),/UUID/);
});
