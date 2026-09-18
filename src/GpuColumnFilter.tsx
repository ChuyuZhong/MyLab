import {useId,useRef,useState} from 'react';
import {Filter} from 'lucide-react';
export function GpuColumnFilter({label,options,selected,onChange}:{label:string;options:{value:string;label:string}[];selected?:string[]|null;onChange:(values:string[]|null)=>void}){
 const id=useId(),panel=useRef<HTMLDivElement>(null),[search,setSearch]=useState(''),[position,setPosition]=useState({left:0,top:0});
 const active=selected!=null,shown=options.filter(o=>o.label.toLowerCase().includes(search.trim().toLowerCase()));
 return <><span className="gpu-column-heading">{label}<button type="button" className={'gpu-filter-trigger'+(active?' active':'')} aria-label={`筛选${label}${active?'（已启用）':''}`} title={`筛选${label}`} popoverTarget={id} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-316)),top:Math.max(8,Math.min(r.bottom+8,window.innerHeight-380))});setSearch('');}}><Filter size={14}/>{active&&<span>{selected.length}</span>}</button></span>
 <div id={id} popover="auto" ref={panel} className="gpu-filter-panel" style={position}>
 <div className="gpu-filter-title"><strong>筛选{label}</strong><button className="text-button" onClick={()=>panel.current?.hidePopover()}>完成</button></div>
 <input aria-label={`搜索${label}筛选项`} placeholder="搜索筛选项…" value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="gpu-filter-actions"><button className="text-button" onClick={()=>onChange(null)}>不限（全部）</button><button className="text-button" onClick={()=>onChange([])}>清空勾选</button></div>
 <div className="gpu-filter-options">{shown.map(o=><label key={o.value}><input type="checkbox" checked={selected==null||selected.includes(o.value)} onChange={e=>{const values=selected??options.map(o=>o.value);onChange(e.target.checked?[...new Set([...values,o.value])]:values.filter(v=>v!==o.value));}}/><span>{o.label}</span></label>)}{!shown.length&&<p className="muted">没有匹配的筛选项</p>}</div>
 <small>勾选后立即生效；同列多选，跨列组合筛选。</small></div></>;
}
