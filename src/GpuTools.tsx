import {useEffect,useRef,useState} from 'react';
import {useApp} from './store';
import {bridgeRequest} from './api';
import {Notice,Field} from './ui';
type Series={label:string;unit:string;points:{time:number;value:number}[]};
export function GpuMetrics({agent,slot}:{agent:string;slot:string}){
  const {data,secrets}=useApp();const [series,setSeries]=useState<Series[]>([]),[message,setMessage]=useState('正在读取监测数据…');
  useEffect(()=>{let busy=false,alive=true;const c=new AbortController();
    const read=async()=>{if(busy||document.visibilityState!=='visible')return;busy=true;try{const r=await bridgeRequest(data.settings,secrets,'/gpu/metrics',{agent,slot},c.signal);if(alive){setSeries(r.series||[]);setMessage(r.message||'');}}catch(e){if(alive)setMessage((e as Error).message);}finally{busy=false;}};
    setSeries([]);void read();const timer=setInterval(read,30000);return()=>{alive=false;c.abort();clearInterval(timer);};
  },[agent,slot,data.settings.bridgeUrl,secrets.bridgeKey]);
  return <section className="gpu-metrics"><h3>近 30 分钟资源消耗</h3><p className="muted">每 30 秒检查 · 按物理 GPU UUID 匹配</p>{message&&<Notice tone="warning">{message}</Notice>}{series.map(s=>{
    const max=s.unit==='%'?100:Math.max(1,...s.points.map(p=>p.value))*1.1;const start=Date.now()-1800000;
    const paths:string[]=[];s.points.forEach((p,i)=>{const cmd=`${i===0||p.time-s.points[i-1].time>90000?'M':'L'}${Math.max(0,Math.min(400,(p.time-start)/1800000*400)).toFixed(1)},${(110-Math.min(1,p.value/max)*100).toFixed(1)}`;paths.push(cmd);});
    const last=s.points.at(-1),stale=last&&Date.now()-last.time>120000;
    return <div key={s.label} className="metric-chart"><strong>{s.label} {last?`${last.value.toFixed(1)} ${s.unit}`:'暂无数据'}</strong>{last&&<><small>{stale?'数据已滞后 · ':''}采样于 {new Date(last.time).toLocaleTimeString('zh-CN')}</small><svg role="img" aria-label={`${s.label}时间曲线，最大刻度 ${max.toFixed(0)} ${s.unit}`} viewBox="0 0 420 145"><text x="0" y="10">{max.toFixed(0)} {s.unit}</text><path d="M0,110 H400" stroke="currentColor" opacity=".2"/><path d={paths.join(' ')} fill="none" stroke="#318896" strokeWidth="2"/><text x="0" y="138">30 分钟前</text><text x="365" y="138">现在</text></svg></>}</div>;
  })}</section>;
}
export function LocalGpuApply(){
 const {data,secrets}=useApp();const [files,setFiles]=useState<string[]>([]),[chosen,setChosen]=useState(''),[preview,setPreview]=useState<{name:string;text:string;hash:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[job,setJob]=useState<{key:string;status:string;message:string;taskId:string}|null>(null);
 const key=useRef(crypto.randomUUID()),lock=useRef(false);
 const api=(path:string,body:object)=>bridgeRequest(data.settings,secrets,path,body);
 useEffect(()=>{if(!job||job.status!=='running')return;let alive=true;const timer=setInterval(()=>{api('/gpu/job',{key:job.key}).then(j=>{if(alive)setJob(j);}).catch(e=>{if(alive)setError(e.message);});},5000);return()=>{alive=false;clearInterval(timer);};},[job?.key,job?.status]);
 async function list(){setBusy(true);setError('');try{const r=await api('/gpu/configs',{});setFiles(r.files);setError(r.message||'');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function inspect(name:string){setChosen(name);setPreview(null);setError('');if(!name)return;setBusy(true);try{setPreview(await api('/gpu/configs',{name}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function submit(){if(!preview||lock.current)return;lock.current=true;setBusy(true);setError('');try{setJob(await api('/gpu/submit',{name:preview.name,hash:preview.hash,key:key.current}));}catch(e){setError((e as Error).message+' 若提交结果不确定，请先使用 det shell ls 核对。');}finally{lock.current=false;setBusy(false);}}
 return <section className="surface local-gpu-apply"><h2>通过本机申请资源</h2><p>选择本机 YAML，核对资源池、卡数、镜像与挂载。点击提交后，本机运行 det shell start --config-file … --detach，由调度器选择板卡。配置不上传 GitHub。</p><button className="secondary" disabled={busy||!!job} onClick={()=>void list()}>读取本机配置</button>{files.length>0&&<Field label="申请配置"><select value={chosen} disabled={busy||!!job} onChange={e=>void inspect(e.target.value)}><option value="">选择配置</option>{files.map(f=><option key={f}>{f}</option>)}</select></Field>}{preview&&<><pre className="gpu-config-preview">{preview.text}</pre><button className="primary" disabled={busy||!!job} onClick={()=>void submit()}>{busy?'正在处理…':'按此配置提交申请'}</button></>}{error&&<Notice tone="warning">{error}</Notice>}{job&&<Notice>{job.message}{job.taskId&&<><p>任务 ID：{job.taskId}</p><code>det shell open {job.taskId}</code><p>不再使用时需在原系统释放，关闭网页不会释放资源。</p></>}</Notice>}<p className="muted">使用“连接 / 登录”中的账号。本机服务重启后，申请记录以 det shell ls 和原系统为准。</p></section>;
}
