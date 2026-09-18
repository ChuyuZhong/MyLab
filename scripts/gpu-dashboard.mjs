import {execFile} from 'node:child_process';
import path from 'node:path';
export function validateDashboardRequest(q){
 if(typeof q.path!=='string'||q.path.length>1000)throw Error('看板路径无效');
 if(!/^\/api\/(overview|task\/(shell|command|experiment)\/[a-zA-Z0-9-]+(?:\/(logs|metrics|tmux|kill))?)(?:\?[^#]*)?$/.test(q.path))throw Error('看板接口未授权');
 const method=q.method||'GET',kill=q.path.split('?')[0].endsWith('/kill');
 if(method!==(kill?'POST':'GET'))throw Error('看板请求方法无效');
 if(kill&&q.body?.confirm!==q.path.split('/').at(-2))throw Error('请输入完整任务 ID 确认释放');
 return {path:q.path,method,body:kill?{confirm:q.body.confirm}:{}};
}
let active=0;
export async function dashboardRequest(q,session){
 if(!session.token||!session.username)throw Error('请先点击连接 / 登录');
 const request=validateDashboardRequest(q);
 if(active>=4)throw Error('正在读取集群，请稍后重试');
 const python=process.env.MYLAB_GPU_PYTHON||path.join(path.dirname(path.dirname(process.env.MYLAB_DET_EXE||'')),'python.exe');
 active++;
 try{return await new Promise((resolve,reject)=>{
  const child=execFile(python,[path.resolve('scripts/determined-dashboard/adapter.py')],{windowsHide:true,timeout:25000,maxBuffer:4000000,env:{...process.env,PYTHONIOENCODING:'utf-8'}},(error,stdout)=>{
   if(error){reject(Error('本机看板请求失败或超时，请检查 Python / Determined / SSH 环境；释放超时请先刷新核对'));return;}
   try{const r=JSON.parse(stdout);if(!r.ok)reject(Error(r.error));else resolve(r.data);}catch{reject(Error('本机看板返回格式无效'));}
  });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...request,session}));
 });}finally{active--;}
}
