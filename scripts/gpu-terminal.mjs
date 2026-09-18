import * as pty from 'node-pty';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sessions=new Map(),opening=new Map();
const owner=s=>createHash('sha256').update(s.base+'\n'+s.username+'\n'+s.token).digest('hex');
export function terminalId(id){if(typeof id!=='string'||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw Error('终端或任务 ID 无效');return id;}
export function terminalSize(cols,rows){if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<10||cols>400||rows<2||rows>150)throw Error('终端尺寸无效');return {cols,rows};}
export function getTerminal(q,s){terminalId(q.id);const t=sessions.get(q.id);if(!t||t.owner!==owner(s))throw Error('终端已断开，请重新连接');t.touched=Date.now();return t;}
export async function openTerminal(q,s,getShell){
 if(!s.token||!s.username)throw Error('请先登录实验室');terminalId(q.id);terminalId(q.taskId);terminalSize(q.cols,q.rows);
 if(sessions.has(q.id)){const t=getTerminal(q,s);if(t.taskId!==q.taskId)throw Error('终端任务不匹配');return {id:q.id};}
 if(opening.has(q.id))return opening.get(q.id);
 const promise=(async()=>{
  if(sessions.size+opening.size>=8)throw Error('终端连接过多，请先断开不用的终端');
  const shell=await getShell(q.taskId);if(shell?.state!=='STATE_RUNNING')throw Error('任务尚未运行或已经结束');
  const python=process.env.MYLAB_GPU_PYTHON||path.join(path.dirname(path.dirname(process.env.MYLAB_DET_EXE||'')),'python.exe');
  const root=path.dirname(python);
  const proc=pty.spawn(python,['-m','determined.cli','-m',s.base,'-u',s.username,'shell','open','--show-ssh-command',q.taskId],{name:'xterm-256color',cols:q.cols,rows:q.rows,cwd:process.cwd(),useConpty:true,env:{...process.env,DET_MASTER:s.base,DET_USER:s.username,DET_USER_TOKEN:s.token,PYTHONIOENCODING:'utf-8',PATH:[root,path.join(root,'Scripts'),path.join(root,'Library','bin'),process.env.PATH].join(path.delimiter)}});
  const t={proc,owner:owner(s),taskId:q.taskId,text:'',offset:0,seq:0,closed:false,listeners:new Set(),touched:Date.now()};sessions.set(q.id,t);
  proc.onData(chunk=>{t.text+=chunk;if(t.text.length>262144){const n=t.text.length-262144;t.text=t.text.slice(n);t.offset+=n;}for(const notify of t.listeners)notify();});
  proc.onExit(()=>{t.closed=true;for(const notify of t.listeners)notify();});return {id:q.id};
 })();opening.set(q.id,promise);try{return await promise;}finally{opening.delete(q.id);}
}
export function terminalAction(action,q,s){const t=getTerminal(q,s);
 if(action==='read'){const cursor=Number.isInteger(q.cursor)?q.cursor:0;return {text:t.text.slice(Math.max(0,cursor-t.offset)),cursor:t.offset+t.text.length,truncated:cursor<t.offset,closed:t.closed};}
 if(action==='write'){if(t.closed)throw Error('终端已退出');if(typeof q.text!=='string'||q.text.length>32768||!Number.isInteger(q.seq))throw Error('终端输入无效');if(q.seq<=t.seq)return {ok:true};if(q.seq!==t.seq+1)throw Error('输入顺序异常，请重新连接');t.proc.write(q.text);t.seq=q.seq;return {ok:true};}
 if(action==='resize'){terminalSize(q.cols,q.rows);if(!t.closed)t.proc.resize(q.cols,q.rows);return {ok:true};}
 if(action==='close'){if(!t.closed)try{t.proc.kill();}catch{}sessions.delete(q.id);return {ok:true};}
 throw Error('终端操作无效');
}
setInterval(()=>{for(const [id,t] of sessions)if(Date.now()-t.touched>120000){if(!t.closed)try{t.proc.kill();}catch{}sessions.delete(id);}},30000).unref();
process.on('exit',()=>{for(const t of sessions.values())try{t.proc.kill();}catch{}});
