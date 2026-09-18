import {useEffect,useRef,useState} from 'react';
import {RefreshCw,PlugZap} from 'lucide-react';
import {useApp} from './store';
import {bridgeRequest} from './api';
import {Heading,Modal,Field,Notice} from './ui';
import {GpuApply,MyGpuTasks} from './GpuTools';
export function GpuPage(){
 const {data,secrets,notify}=useApp();const frame=useRef<HTMLIFrameElement>(null);
 const [login,setLogin]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[pool,setPool]=useState(''),[revision,setRevision]=useState(0),[fallback,setFallback]=useState(false);
 const refresh=()=>{frame.current?.contentWindow?.postMessage({type:'mylab-refresh'},location.origin);setRevision(r=>r+1);};
 useEffect(()=>{
  const listener=async(e:MessageEvent)=>{
   if(e.origin!==location.origin||e.source!==frame.current?.contentWindow)return;
   const q=e.data;
   if(q?.type==='mylab-gpu-apply'&&['s3-4090','d2-a800'].includes(q.pool)){setPool(q.pool);return;}
   if(q?.type!=='mylab-gpu-request'||typeof q.id!=='string')return;
   const target=frame.current?.contentWindow;
   try{const result=await bridgeRequest(data.settings,secrets,'/gpu/dashboard',{path:q.path,method:q.method,body:q.body});target?.postMessage({type:'mylab-gpu-response',id:q.id,data:result},location.origin);}
   catch(e){target?.postMessage({type:'mylab-gpu-response',id:q.id,error:(e as Error).message},location.origin);}
  };
  window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 },[data.settings,secrets]);
 function syncTheme(){frame.current?.contentWindow?.postMessage({type:'mylab-theme',theme:document.documentElement.dataset.theme||'light'},location.origin);}
 useEffect(()=>{const o=new MutationObserver(syncTheme);o.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>o.disconnect();},[]);
 return <><Heading eyebrow="COMPUTE, WITH CLARITY" title="让算力，跟上想法。" description="资源池、任务日志与容器状态，在一处掌握。" action={<div className="button-group"><button className="secondary" onClick={refresh}><RefreshCw size={16}/>刷新</button><button className="primary" onClick={()=>setLogin(true)}><PlugZap size={16}/>连接 / 登录</button></div>}/>
 {!secrets.bridgeKey&&<Notice tone="warning">请先在设置中填写本机服务配对码，再连接实验室。看板通过本机服务读取实时数据。</Notice>}
 <iframe ref={frame} title="MyLab 实验室集群看板" src={import.meta.env.BASE_URL+'gpu-dashboard.html?v=20260918'} onLoad={syncTheme} style={{width:'100%',height:'calc(100vh - 215px)',minHeight:650,border:'1px solid var(--line)',borderRadius:18,background:'var(--surface)'}}/>
 <p className="muted">空闲为浅绿，已占用为浅红；本人任务另有描边。tmux 为只读查看，关闭页面不会释放任务。</p>
 <button className="text-button" onClick={()=>setFallback(v=>!v)}>{fallback?'收起':'展开'} 5005 任务监控与 Max days</button>{fallback&&<MyGpuTasks revision={revision}/>}
 {pool&&<Modal drawer title="申请 GPU 资源" onClose={()=>setPool('')}><GpuApply key={pool} pool={pool} onCreated={refresh}/></Modal>}
 {login&&<Modal title="连接实验室" onClose={()=>{setLogin(false);setPassword('');}}><form className="form-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await bridgeRequest(data.settings,secrets,'/gpu/login',{base:data.settings.gpuUrl,username,password});setPassword('');setLogin(false);refresh();notify('实验室已连接');}catch(e){notify((e as Error).message);}finally{setBusy(false);}}}>
 <Notice>沿用设置中的实验室地址：{data.settings.gpuUrl}。登录凭据仅由本机服务处理。</Notice><Field label="用户名"><input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></Field><Field label="密码"><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><button className="primary" disabled={busy}>{busy?'连接中…':'登录并读取资源'}</button></form></Modal>}
 {data.requests.length>0&&<details className="surface" style={{marginTop:16,padding:16}}><summary>已保存的个人申请记录（{data.requests.length}）</summary>{data.requests.map(r=><p key={r.id}>{r.title} · {r.count} 张 · {r.status}</p>)}</details>}
 </>;
}
