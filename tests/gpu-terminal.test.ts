import test from 'node:test';
import assert from 'node:assert/strict';
import {terminalId,terminalSize,openTerminal,terminalAction,terminalEnvironment} from '../scripts/gpu-terminal.mjs';
test('terminal only accepts concrete task IDs and bounded integer dimensions',()=>{
 assert.equal(terminalId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 for(const id of ['../a','x;whoami','',null])assert.throws(()=>terminalId(id));
 for(const [c,r] of [[0,24],[80,-1],[401,24],[80,151],[1.5,24]])assert.throws(()=>terminalSize(c,r));
 assert.deepEqual(terminalSize(80,24),{cols:80,rows:24});
});
test('terminal requires a login and cannot read unknown sessions',async()=>{
 await assert.rejects(openTerminal({}, {}, ()=>{throw Error('must not execute');}),/登录/);
 assert.throws(()=>terminalAction('read',{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},{base:'x',username:'u',token:'t'}),/断开/);
});


test('SSH child always advertises xterm capabilities even if host TERM is missing or dumb',()=>{
 for(const host of [{PATH:'test'},{TERM:'dumb',COLORTERM:'',PATH:'test'}]){
  const env=terminalEnvironment(host);
  assert.equal(env.TERM,'xterm-256color');assert.equal(env.COLORTERM,'truecolor');assert.equal(env.PATH,'test');
  assert.notEqual(host.TERM,'xterm-256color');
 }
});
