import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
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
test('static dashboard scripts parse and transport does not contain credentials',()=>{
 const html=readFileSync('public/gpu-dashboard.html','utf8');
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(match[1]);
 assert.ok(html.includes('e.source!==parent || e.origin!==location.origin'));
 assert.ok(!html.includes('Bearer '));assert.ok(!html.includes('fetch(path'));
});
