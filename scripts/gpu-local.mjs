import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
const jobs=new Map();
const hash=s=>createHash('sha256').update(s).digest('hex');
export function validConfigName(name){return typeof name==='string' && /^[\w-]+\.ya?ml$/.test(name);}
async function configFile(name){
  const root=process.env.MYLAB_GPU_CONFIG_DIR;
  if(!root || !process.env.MYLAB_DET_EXE)throw Error('本机尚未配置 MYLAB_GPU_CONFIG_DIR 和 MYLAB_DET_EXE');
  if(!validConfigName(name) || !name.startsWith(process.env.MYLAB_GPU_CONFIG_PREFIX || ''))throw Error('配置文件名无效');
  const dir=await fs.realpath(root),file=await fs.realpath(path.join(dir,name));
  if(path.dirname(file).toLowerCase()!==dir.toLowerCase())throw Error('配置必须位于允许目录内');
  if((await fs.stat(file)).size>100000)throw Error('配置文件过大');
  return {file,text:await fs.readFile(file,'utf8')};
}
export async function gpuConfigs(name){
  if(!name){if(!process.env.MYLAB_GPU_CONFIG_DIR)return {files:[],message:'请在本机 .env.local 配置申请目录与 det 路径'};
    return {files:(await fs.readdir(process.env.MYLAB_GPU_CONFIG_DIR)).filter(n=>validConfigName(n)&&n.startsWith(process.env.MYLAB_GPU_CONFIG_PREFIX || '')).sort()};}
  const {text}=await configFile(name);return {name,text,hash:hash(text)};
}
const starting=new Map();
export async function startGpuShell(q,session){
 const owner=session.username;
 if(starting.has(owner))return starting.get(owner);
 const work=launch(q,session);starting.set(owner,work);try{return await work;}finally{starting.delete(owner);}
}
async function launch(q,session){
  if(!session.token || !session.username)throw Error('请先登录实验室账号');
  if(typeof q.key!=='string'||! /^[a-f0-9-]{36}$/i.test(q.key))throw Error('申请标识无效');
  const key=session.username+':'+q.key;
  if(jobs.has(key))return jobs.get(key);
  if([...jobs.values()].some(j=>j.owner===session.username&&j.status==='running'))throw Error('已有申请正在提交，请等待结果');
  if(jobs.size>=100)throw Error('本次服务会话申请记录已达上限，请重启服务后先核对已有任务');
  const {text}=await configFile(q.name);
  if(q.hash!==hash(text))throw Error('配置已变化，请重新预览后提交');
  const dir=path.resolve('.local/gpu-submissions');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,randomUUID()+'.yaml');await fs.writeFile(file,text);
  const exe=process.env.MYLAB_DET_EXE;
  const job={key:q.key,owner:session.username,name:q.name,status:'running',taskId:'',message:'正在提交，切勿重复申请',createdAt:new Date().toISOString()};jobs.set(key,job);
  const envRoot=path.dirname(path.dirname(exe));
  execFile(exe,['-m',session.base,'-u',session.username,'shell','start','--config-file',file,'--detach'],{windowsHide:true,timeout:90000,maxBuffer:100000,cwd:dir,env:{...process.env,DET_USER:session.username,DET_USER_TOKEN:session.token,DET_MASTER:session.base,PYTHONIOENCODING:'utf-8',PATH:[envRoot,path.join(envRoot,'Scripts'),path.join(envRoot,'Library','bin'),process.env.PATH].join(path.delimiter)}},async(error,stdout)=>{
    const id=stdout.trim().split(/\s+/).find(s=>/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(s));
    job.taskId=id||'';job.status=id?'submitted':'unknown';job.message=id?'已创建任务，等待调度。':'未取得任务 ID，结果不确定。请先在原系统或 det shell ls 核对，勿直接重试。';
    await fs.rm(file,{force:true}).catch(()=>{});
  });
  return job;
}
export function gpuJob(key,username){const job=jobs.get(username+':'+key);if(!job)throw Error('未找到本次申请记录；服务重启后请用 det shell ls 核对');return job;}
export function parseMetricSeries(result){return result.flatMap(r=>(r.values||[]).map(([time,value])=>({time:Number(time)*1000,value:Number(value)}))).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.value>=0&&p.value<1e12).sort((a,b)=>a.time-b.time);}
export async function gpuMetrics(uuid){
  if(!/^GPU-[a-f0-9-]+$/i.test(uuid||''))throw Error('该卡未提供有效 GPU UUID');
  const base=process.env.MYLAB_GPU_PROMETHEUS_URL;if(!base)return {series:[],message:'本机未配置 GPU 指标服务'};
  const end=Math.floor(Date.now()/1000),series=[];
  for(const [metric,label,unit] of [['DCGM_FI_DEV_GPU_UTIL','GPU 利用率','%'],['DCGM_FI_DEV_FB_USED','显存占用','MiB']]){
    const u=new URL('/api/v1/query_range',base);u.search=new URLSearchParams({query:`${metric}{UUID="${uuid}"}`,start:String(end-1800),end:String(end),step:'30'}).toString();
    const r=await fetch(u,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('监控服务返回 HTTP '+r.status);
    const d=await r.json();if(d.status!=='success')throw Error('监控查询失败');
    if(d.data.result.length>1)throw Error('同一 GPU 返回多条指标，请管理员配置唯一采集来源');
    series.push({label,unit,points:parseMetricSeries(d.data.result)});
  }
  return {series,fetchedAt:new Date().toISOString(),message:series.every(s=>!s.points.length)?'监控服务未提供这张卡的 GPU 指标；不是零占用。请管理员接入 DCGM 指标。':''};
}
