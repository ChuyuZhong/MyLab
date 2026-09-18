import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connectTerminal} from '../scripts/gpu-websocket.mjs';
class Socket extends EventEmitter {
 readyState=1;bufferedAmount=0;messages:any[]=[];
 send(s:string){this.messages.push(JSON.parse(s));}
 close(){this.readyState=3;this.emit('close');}
 terminate(){this.close();}
 ping(){}
}
function fixture(text:string,offset=0){
 let paused=0,resumed=0;
 const t={text,offset,seq:0,closed:false,listeners:new Set(),proc:{pause(){paused++;},resume(){resumed++;}},touched:0};
 const ws=new Socket();connectTerminal(ws,t,'test',{},offset);
 return {t,ws,counts:()=>({paused,resumed})};
}
test('output flow pauses at high water and resumes after parser acknowledgement',async()=>{
 const {ws,t,counts}=fixture('a'.repeat(100000));
 try{
  await new Promise(r=>setTimeout(r,30));
  assert.equal(ws.messages.filter(m=>m.type==='output').map(m=>m.text).join('').length,65536);
  assert.equal(counts().paused,1);
  ws.emit('message',Buffer.from(JSON.stringify({type:'ack',cursor:65536})));
  await new Promise(r=>setTimeout(r,30));
  assert.equal(ws.messages.filter(m=>m.type==='output').map(m=>m.text).join(''),t.text);
  assert.equal(counts().resumed,1);
 }finally{ws.close();}
 assert.equal(t.listeners.size,0);
});
test('invalid output acknowledgement closes stream',()=>{
 const {ws}=fixture('hello');
 ws.emit('message',Buffer.from(JSON.stringify({type:'ack',cursor:1000})));
 assert.equal(ws.readyState,3);
 assert.equal(ws.messages.at(-1).type,'error');
});
test('reconnect beyond retained output fails explicitly rather than dropping terminal sequences',async()=>{
 const {ws,t}=fixture('hello');t.offset=500;
 await new Promise(r=>setTimeout(r,30));
 assert.equal(ws.readyState,3);
 assert.equal(ws.messages.at(-1).type,'error');
});
