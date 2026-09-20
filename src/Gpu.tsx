import {useState} from 'react';
import {RefreshCw,PlugZap} from 'lucide-react';
import {useApp} from './store';
import {bridgeRequest} from './api';
import {Heading,Modal,Field,Notice} from './ui';
import {GpuApply,MyGpuTasks} from './GpuTools';
import {GpuNative} from './GpuNative';
export function GpuPage(){
 const {data,secrets,notify}=useApp();
 const [login,setLogin]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[pool,setPool]=useState<string|null>(null),[revision,setRevision]=useState(0),[fallback,setFallback]=useState(false);
 const refresh=()=>setRevision(r=>r+1);
 return <><Heading eyebrow="COMPUTE, WITH CLARITY" title="让算力，跟上想法。" description="资源池、任务日志与容器状态，在一处掌握。" action={<div className="button-group"><button className="secondary" onClick={refresh}><RefreshCw size={16}/>刷新</button><button className="primary" onClick={()=>setLogin(true)}><PlugZap size={16}/>连接 / 登录</button></div>}/>
 {!secrets.bridgeKey&&<Notice tone="warning">请先在设置中填写本机服务配对码，再连接实验室。看板通过本机服务读取实时数据。</Notice>}
 <GpuNative revision={revision} onApply={setPool}/>
 <p className="muted">空闲为浅绿，已占用为浅红；本人任务另有描边。终端可直接输入命令，关闭页面不会释放任务。</p>
 <button className="text-button" onClick={()=>setFallback(v=>!v)}>{fallback?'收起':'展开'} 5005 任务监控与 Max days</button>{fallback&&<MyGpuTasks revision={revision}/>}
 {pool!==null&&<Modal drawer title="申请 GPU 资源" onClose={()=>setPool(null)}><GpuApply key={pool} pool={pool} onCreated={refresh}/></Modal>}
 {login&&<Modal title="连接实验室" onClose={()=>{setLogin(false);setPassword('');}}><form className="form-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await bridgeRequest(data.settings,secrets,'/gpu/login',{base:data.settings.gpuUrl,username,password});setPassword('');setLogin(false);refresh();notify('实验室已连接');}catch(e){notify((e as Error).message);}finally{setBusy(false);}}}>
 <Notice>沿用设置中的实验室地址：{data.settings.gpuUrl}。登录凭据仅由本机服务处理。</Notice><Field label="用户名"><input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></Field><Field label="密码"><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><button className="primary" disabled={busy}>{busy?'连接中…':'登录并读取资源'}</button></form></Modal>}
 {data.requests.length>0&&<details className="surface" style={{marginTop:16,padding:16}}><summary>已保存的个人申请记录（{data.requests.length}）</summary>{data.requests.map(r=><p key={r.id}>{r.title} · {r.count} 张 · {r.status}</p>)}</details>}
 </>;
}
