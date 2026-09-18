import {randomBytes} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
import {getTerminal,terminalAction} from './gpu-terminal.mjs';

// Tickets are short lived, single use, and bound to the paired HTTP origin/session.
export function installTerminalWebSocket(server,{origins,port,session}) {
 const tickets=new Map();
 const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
 const sweep=setInterval(()=>{for(const [key,t] of tickets)if(t.expires<Date.now())tickets.delete(key);},30000);sweep.unref();
 server.on('close',()=>{clearInterval(sweep);wss.close();});
 server.on('upgrade',(req,socket,head)=>{
  const reject=()=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
  try {
   const url=new URL(req.url,'http://localhost'),key=url.searchParams.get('ticket'),ticket=tickets.get(key);
   if(url.pathname!=='/gpu/terminal/ws'||!origins.has(req.headers.origin)||!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!ticket||ticket.expires<Date.now()||ticket.origin!==req.headers.origin)return reject();
   tickets.delete(key);
   const s=session(),t=getTerminal({id:ticket.id},s);
   if(t.socket)return reject();
   wss.handleUpgrade(req,socket,head,ws=>connectTerminal(ws,t,ticket.id,s,ticket.cursor));
  }catch{reject();}
 });
 return (q,s,origin)=>{
  getTerminal(q,s);
  if(!origins.has(origin))throw Error('终端连接来源无效');
  if(!Number.isInteger(q.cursor)||q.cursor<0)throw Error('终端输出位置无效');
  if(tickets.size>=128)throw Error('连接请求过多，请稍后重试');
  const ticket=randomBytes(24).toString('base64url');
  tickets.set(ticket,{id:q.id,origin,cursor:q.cursor,expires:Date.now()+15000});
  return {ticket};
 };
}

export function connectTerminal(ws,t,id,s,cursor) {
 let sent=cursor,acked=cursor,paused=false,timer,alive=true,lastPong=Date.now();
 t.socket=ws;
 const send=m=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));};
 const fail=message=>{send({type:'error',message});ws.close(1008);};
 function pump(){
  timer=undefined;if(!alive||ws.readyState!==WebSocket.OPEN)return;
  if(sent<t.offset||sent>t.offset+t.text.length)return fail('断线期间输出已超出缓存，请重新连接终端，并重新进入 tmux。');
  while(sent<t.offset+t.text.length&&sent-acked<65536&&ws.bufferedAmount<65536){
   const text=t.text.slice(sent-t.offset,sent-t.offset+32768);sent+=text.length;send({type:'output',text,cursor:sent});
  }
  const blocked=sent-acked>=65536||ws.bufferedAmount>=65536;
  if(blocked&&!paused&&!t.closed){t.proc.pause();paused=true;}
  if(!blocked&&paused&&!t.closed){t.proc.resume();paused=false;}
  if(t.closed&&sent===t.offset+t.text.length&&acked===sent){send({type:'exit'});ws.close(1000);}
 }
 const schedule=()=>{if(alive&&!timer)timer=setTimeout(pump,8);};
 t.listeners.add(schedule);
 ws.on('pong',()=>{lastPong=Date.now();t.touched=Date.now();});
 const heartbeat=setInterval(()=>{if(Date.now()-lastPong>45000)ws.terminate();else{t.touched=Date.now();ws.ping();schedule();}},15000);
 ws.on('message',raw=>{
  try{
   const q=JSON.parse(raw.toString());t.touched=Date.now();
   if(q.type==='input'){terminalAction('write',{id,text:q.text,seq:q.seq},s);send({type:'inputAck',seq:q.seq});}
   else if(q.type==='resize')terminalAction('resize',{id,cols:q.cols,rows:q.rows},s);
   else if(q.type==='ack'){if(!Number.isInteger(q.cursor)||q.cursor<acked||q.cursor>sent)throw Error('输出确认无效');acked=q.cursor;schedule();}
   else throw Error('终端消息无效');
  }catch(e){fail(e.message);}
 });
 const cleanup=()=>{if(!alive)return;alive=false;clearInterval(heartbeat);clearTimeout(timer);t.listeners.delete(schedule);if(t.socket===ws)t.socket=null;if(paused&&!t.closed)try{t.proc.resume();}catch{}t.touched=Date.now();};
 ws.on('close',cleanup);ws.on('error',()=>{cleanup();ws.terminate();});
 send({type:'ready',seq:t.seq});schedule();
}
