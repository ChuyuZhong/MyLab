import {useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {useApp} from './store';
import {bridgeRequest} from './api';
import {Notice} from './ui';
export function GpuTerminal({taskId}:{taskId:string}){
 const {data,secrets}=useApp();const host=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[status,setStatus]=useState('正在连接任务终端…');
 useEffect(()=>{
  const id=crypto.randomUUID(),term=new Terminal({cursorBlink:true,fontSize:13,scrollback:3000,theme:{background:'#172731',foreground:'#e4edef'}}),fit=new FitAddon();term.loadAddon(fit);term.open(host.current!);
  let alive=true,opened=false,seq=0,confirmed=0,cursor=0,ws:WebSocket|undefined,retries=0,inputFailed=false,failed=false;
  let retryTimer:ReturnType<typeof setTimeout>|undefined,resizeTimer:ReturnType<typeof setTimeout>|undefined;
  const api=(action:string,body:object={})=>bridgeRequest(data.settings,secrets,'/gpu/terminal/'+action,{id,...body});
  const send=(msg:object)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));};
  function fitTerminal(){if(!host.current?.offsetWidth||!host.current?.offsetHeight)return;fit.fit();if(opened)send({type:'resize',cols:Math.max(10,term.cols),rows:Math.max(2,term.rows)});}
  fitTerminal();
  const sub=term.onData(text=>{
   if(!opened||inputFailed||!alive)return;
   if((ws?.bufferedAmount||0)>65536){inputFailed=true;setError('输入积压，已停止发送新输入。请核对终端后重新连接。');return;}
   // A paste is split without waiting for a round trip; WebSocket preserves order.
   for(let i=0;i<text.length;i+=8192)send({type:'input',text:text.slice(i,i+8192),seq:++seq});
  });
  const ro=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(fitTerminal,80);});ro.observe(host.current!);
  async function connect(){
   try{
    const {ticket}=await api('ticket',{cursor});if(!alive)return;
    const url=new URL(data.settings.bridgeUrl);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/gpu/terminal/ws';url.search='';url.searchParams.set('ticket',ticket);
    const socket=new WebSocket(url);ws=socket;
    const deadline=setTimeout(()=>{if(socket.readyState===WebSocket.CONNECTING)socket.close();},10000);
    socket.onmessage=e=>{
     if(!alive||ws!==socket)return;
     try{
      const m=JSON.parse(e.data);
      if(m.type==='ready'){
       if(m.seq<seq&&confirmed<seq){inputFailed=true;setError('断线前部分输入是否执行尚不确定，未自动重放；请核对输出后重新连接。');}
       seq=Math.max(seq,m.seq);confirmed=m.seq;opened=true;retries=0;setStatus('WebSocket 实时连接 · 可直接输入命令');fitTerminal();term.focus();
      }else if(m.type==='output'){
       term.write(m.text,()=>{if(alive){cursor=m.cursor;if(ws===socket)send({type:'ack',cursor});}});
      }else if(m.type==='inputAck')confirmed=Math.max(confirmed,m.seq);
      else if(m.type==='error'){failed=true;inputFailed=true;setError(m.message);}
      else if(m.type==='exit'){failed=true;opened=false;setStatus('终端已退出，GPU 任务未自动释放');}
     }catch{failed=true;setError('终端消息异常，请重新连接。');socket.close();}
    };
    socket.onopen=()=>clearTimeout(deadline);
    socket.onerror=()=>{ /* close reports the actionable connection state */ };
    socket.onclose=()=>{clearTimeout(deadline);if(!alive||ws!==socket)return;opened=false;
     if(!failed&&retries<3){setStatus('连接中断，正在恢复…');retryTimer=setTimeout(()=>void connect(),1000*2**retries++);}
     else if(!failed)setError('WebSocket 无法连接。请确认本机服务已更新，且浏览器允许网站访问本地网络。');
    };
   }catch(e){if(alive)setError((e as Error).message);}
  }
  void api('open',{taskId,cols:Math.max(10,term.cols),rows:Math.max(2,term.rows)}).then(()=>{if(alive)void connect();else void api('close').catch(()=>{});}).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;opened=false;clearTimeout(retryTimer);clearTimeout(resizeTimer);ro.disconnect();sub.dispose();if(ws){ws.onclose=null;ws.close();}term.dispose();void api('close').catch(()=>{});};
 },[taskId]);
 return <section><p className="muted" role="status">{status}</p>{error&&<Notice tone="warning">{error}</Notice>}<div ref={host} className="gpu-live-terminal"/><p className="muted">可直接输入命令，使用 <code>tmux ls</code> 查看会话或 <code>tmux attach</code> 进入会话。关闭侧栏仅断开终端，长任务建议在 tmux 内运行。</p></section>;
}
