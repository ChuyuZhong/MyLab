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
  const id=crypto.randomUUID(),term=new Terminal({cursorBlink:true,fontSize:13,scrollback:3000,theme:{background:'#172731',foreground:'#e4edef'}}),fit=new FitAddon();term.loadAddon(fit);term.open(host.current!);fit.fit();
  let alive=true,opened=false,seq=0,cursor=0,busy=false,chain=Promise.resolve(),inputFailed=false;
  const api=(action:string,body:object={})=>bridgeRequest(data.settings,secrets,'/gpu/terminal/'+action,{id,...body});
  const sub=term.onData(text=>{if(!opened||inputFailed)return;const inputSeq=++seq;chain=chain.then(async()=>{if(!alive||inputFailed)return;await api('write',{text,seq:inputSeq});}).catch(e=>{inputFailed=true;setError(e.message+'；输入结果不确定，请检查终端后重新连接。');});});
  const ro=new ResizeObserver(()=>{fit.fit();if(opened&&alive)void api('resize',{cols:Math.max(10,term.cols),rows:Math.max(2,term.rows)}).catch(()=>{});});ro.observe(host.current!);
  void api('open',{taskId,cols:Math.max(10,term.cols),rows:Math.max(2,term.rows)}).then(()=>{if(!alive){void api('close');return;}opened=true;setStatus('已连接 · 可直接输入命令');term.focus();}).catch(e=>{if(alive)setError(e.message);});
  const timer=setInterval(async()=>{if(!alive||!opened||busy)return;busy=true;try{const r=await api('read',{cursor});if(alive){if(r.truncated)term.writeln('\r\n[部分旧输出已清理]');term.write(r.text);cursor=r.cursor;if(r.closed){opened=false;setStatus('终端连接已结束，GPU 任务未自动释放');}}}catch(e){if(alive){setError((e as Error).message);opened=false;}}finally{busy=false;}},300);
  return()=>{alive=false;clearInterval(timer);ro.disconnect();sub.dispose();term.dispose();void chain.finally(()=>api('close')).catch(()=>{});};
 },[taskId]);
 return <section><p className="muted">{status}</p>{error&&<Notice tone="warning">{error}</Notice>}<div ref={host} className="gpu-live-terminal"/><p className="muted">直接操作此任务的 Shell。可输入 <code>tmux ls</code> 或 <code>tmux attach</code>。关闭侧栏仅断开终端，长任务建议在 tmux 内运行。</p></section>;
}
