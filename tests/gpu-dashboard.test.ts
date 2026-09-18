import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDashboardRequest,dashboardRequest} from '../scripts/gpu-dashboard.mjs';
test('dashboard gateway only permits known routes and explicit task-ID kill confirmation',()=>{
 assert.equal(validateDashboardRequest({path:'/api/overview'}).method,'GET');
 assert.equal(validateDashboardRequest({path:'/api/task/shell/abc/tmux?pane=%251'}).method,'GET');
 for(const q of [{path:'http://localhost/'},{path:'/api/users'},{path:'/api/task/shell/../kill',method:'POST'},{path:'/api/task/shell/abc/kill',method:'POST',body:{confirm:'wrong'}},{path:'/api/overview',method:'POST'}])assert.throws(()=>validateDashboardRequest(q));
 assert.equal(validateDashboardRequest({path:'/api/task/shell/abc/kill',method:'POST',body:{confirm:'abc'}}).body.confirm,'abc');
});
test('dashboard refuses execution without authenticated bridge session',async()=>{
 await assert.rejects(dashboardRequest({path:'/api/overview'},{}),/登录/);
});
test('GPU dashboard is native and shares MyLab drawer',()=>{
 const page=readFileSync('src/Gpu.tsx','utf8'),native=readFileSync('src/GpuNative.tsx','utf8');
 assert.ok(!page.includes('<iframe'));assert.ok(native.includes('<Modal drawer'));
});
