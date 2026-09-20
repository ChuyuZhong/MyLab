import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';
import {gpuConfigs} from './gpu-local.mjs';
const exec=promisify(execFile);
export const baseTemplate='zcy_task.yaml';
export function poolOptions(agents,pools){return [...new Set(pools.map(p=>p.name).filter(n=>typeof n==='string'&&n))].map(pool=>({pool,file:baseTemplate,available:poolAvailability(agents,pool)}));}
export function validateCount(count,available){
  if(!Number.isInteger(count)||count<0||count>available)throw Error(`卡数必须是 0 至 ${available} 的整数`);
  return count;
}
export function poolAvailability(agents,pool){
 return agents.filter(a=>a.enabled&&!a.draining&&(a.resourcePools||[]).includes(pool)).reduce((n,a)=>n+Object.values(a.slots||{}).filter(s=>s.enabled&&!s.draining&&!s.container&&['TYPE_GPU','TYPE_CUDA','TYPE_ROCM'].includes(s.device?.type)).length,0);
}
export function assertOwner(shell,username){if(!username||shell?.username!==username)throw Error('只允许操作当前账号的任务');}
export function safeTask(s){return {id:s.id,description:s.description,state:s.state,pool:s.resourcePool,startTime:s.startTime,devices:(s.container?.devices||[]).filter(d=>['TYPE_GPU','TYPE_CUDA','TYPE_ROCM'].includes(d.type)).map(d=>({id:d.id,uuid:d.uuid})),agent:s.container?.agentId||''};}
function cliEnv(session){const root=path.dirname(path.dirname(process.env.MYLAB_DET_EXE));return {...process.env,DET_USER:session.username,DET_USER_TOKEN:session.token,DET_MASTER:session.base,PYTHONIOENCODING:'utf-8',PATH:[root,path.join(root,'Scripts'),path.join(root,'Library','bin'),process.env.PATH].join(path.delimiter)};}
function run(session,args){return exec(process.env.MYLAB_DET_EXE,['-m',session.base,'-u',session.username,...args],{windowsHide:true,timeout:90000,maxBuffer:100000,env:cliEnv(session)});}
const jobs=new Map(),locks=new Set();
const dir=path.resolve('.local/gpu-control');
async function save(job){await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,job.key+'.json'),JSON.stringify(job));}
function validKey(key){if(typeof key!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))throw Error('任务标识无效');}
export async function readJob(key,owner){validKey(key);let j=jobs.get(key);if(!j){try{j=JSON.parse(await fs.readFile(path.join(dir,key+'.json'),'utf8'));}catch{throw Error('未找到申请记录');}if(j.status==='running')j={...j,status:'unknown',message:'服务已重启，请先刷新我的任务核对，勿重复申请。'};}if(j.owner!==owner)throw Error('申请记录不属于当前账号');return j;}
export async function submit(q,session,getAgents,getPools){
 if(!session.token||!session.username)throw Error('请先登录实验室');validKey(q.key);
 if(locks.has(session.username))throw Error('正在提交申请，请等待');
 locks.add(session.username);
 try{
  try{return await readJob(q.key,session.username);}catch(e){if(e.message!=='未找到申请记录')throw e;}
  const a=await getAgents();
  const pools=getPools?await getPools():a.flatMap(x=>(x.resourcePools||[]).map(name=>({name})));
  if(typeof q.pool!=='string'||!pools.some(p=>p.name===q.pool))throw Error('资源池不存在');
  validateCount(q.count,poolAvailability(a,q.pool));
  const config=await gpuConfigs(baseTemplate);
  const file=path.join(dir,q.key+'.yaml');await fs.mkdir(dir,{recursive:true});await fs.writeFile(file,config.text);
  const job={key:q.key,owner:session.username,pool:q.pool,count:q.count,taskId:'',status:'running',message:'正在提交，请勿重复申请',createdAt:new Date().toISOString()};
  await save(job);jobs.set(q.key,job);
  void run(session,['shell','start','--config-file',file,'--config',`resources.slots=${q.count}`,'--config',`resources.resource_pool=${q.pool}`,'--detach']).then(({stdout})=>{
   const id=stdout.match(/\b[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\b/i)?.[0];job.taskId=id||'';job.status=id?'submitted':'unknown';job.message=id?'已创建任务，等待集群调度':'未取得任务 ID，请刷新我的任务核对，勿直接重试';
  },()=>{job.status='unknown';job.message='命令失败或超时，结果不确定；请刷新我的任务或运行 det shell ls 核对';}).finally(async()=>{await save(job).catch(()=>{});await fs.rm(file,{force:true}).catch(()=>{});locks.delete(session.username);});
  return job;
 }catch(e){locks.delete(session.username);throw e;}
 finally{if(![...jobs.values()].some(j=>j.owner===session.username&&j.status==='running'))locks.delete(session.username);}
}
export async function killTask(id,session,getShell){validKey(id);await getShell(id);try{await run(session,['shell','kill',id]);}catch{throw Error('释放命令未确认成功，请刷新任务状态后核对');}return {message:'已发送释放命令，等待集群确认结束'};}
export function parseMonitor(html){
 const $=load(html),headers=$('th').map((i,e)=>$(e).text().trim()).get();
 const parse=v=>{try{const a=JSON.parse(v);return Array.isArray(a)?a.slice(1).filter(Array.isArray).map(g=>g.map(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null)):[];}catch{return [];}};
 return $('tbody tr').toArray().map(tr=>{const cells=$(tr).find('td').map((i,e)=>$(e).text().trim()).get(),get=h=>cells[headers.indexOf(h)]||'';return {taskId:get('taskid'),maxDays:get('max_days'),startTime:get('start_time'),sampledAt:get('log_time'),memory:parse(get('gpu_memory (GB)')),utilization:parse(get('gpu_utilization (%)'))};}).filter(r=>r.taskId);
}
const histories=new Map();let cache=[],cachedAt=0,pending;
export async function taskMonitor(id){
 if(Date.now()-cachedAt>30000){if(!pending)pending=(async()=>{const r=await fetch(process.env.MYLAB_GPU_MONITOR_URL||'http://172.17.167.89:5005/',{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('监控页面读取失败');const html=await r.text();if(html.length>3000000)throw Error('监控页面过大');cache=parseMonitor(html);cachedAt=Date.now();})().finally(()=>{pending=null;});await pending;}
 const row=cache.find(r=>r.taskId===id);if(!row)return {series:[],message:'该任务尚未上报监控；0 卡任务可能没有 GPU 指标'};
 const time=Date.parse(row.sampledAt.replace(' ','T')+( /Z$|[+-]\d\d:\d\d$/.test(row.sampledAt)?'':'+08:00'));
 const history=(histories.get(id)||[]).filter(r=>r.time>Date.now()-1800000);
 if(Number.isFinite(time)&&time>Date.now()-1800000&&time<=Date.now()+60000&&!history.some(r=>r.time===time))history.push({...row,time});
 history.sort((a,b)=>a.time-b.time);histories.set(id,history.slice(-120));
 if(histories.size>100)histories.delete(histories.keys().next().value);
 const series=[];for(const [field,label,unit] of [['memory','显存','GB'],['utilization','GPU 利用率','%']])row[field].forEach((g,gi)=>g.forEach((value,i)=>{series.push({label:`上报组 ${gi+1} · 卡 ${i+1} · ${label}`,unit,current:value,points:history.flatMap(r=>{const v=r[field][gi]?.[i];return typeof v==='number'?[{time:r.time,value:v}]:[];})});}));
 return {...row,series,message:!Number.isFinite(time)||Date.now()-time>120000?'监控数据已过期或时间无效，请以采样时间为准':''};
}
