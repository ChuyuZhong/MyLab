import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ArrowUpRight, Info } from "lucide-react";
import { safeUrl } from "./core";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  drawer = false,
  expanded = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
  expanded?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [width,setWidth]=useState(()=>{try{return Math.max(380,Math.min(1200,Number(localStorage.getItem('mylab-drawer-width'))||540));}catch{return 540;}});
  const backdropDown=useRef(false);
  useEffect(()=>{if(ref.current)ref.current.scrollTop=0;},[expanded]);
  const drag=useRef<{x:number;width:number}|null>(null);
  function resize(value:number){const next=Math.round(Math.max(Math.min(380,window.innerWidth*.95),Math.min(window.innerWidth*.95,value)));setWidth(next);try{localStorage.setItem('mylab-drawer-width',String(next));}catch{}}

  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "") + (drawer && !expanded ? " drawer" : "") + (expanded ? " terminal-expanded" : "")}
      style={drawer&&!expanded?{width:`min(${width}px, 95vw)`}:undefined}
      onCancel={onClose}
      onPointerDown={e=>{backdropDown.current=e.target===ref.current;}}
      onClick={(e) => {
        if (e.target === ref.current && backdropDown.current) onClose();
      }}
    >
      {drawer&&!expanded&&<div className="drawer-resize-handle" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.max(1200,width)} aria-valuenow={width} tabIndex={0}
        onPointerDown={e=>{drag.current={x:e.clientX,width:ref.current!.getBoundingClientRect().width};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
        onPointerMove={e=>{if(drag.current)resize(drag.current.width+drag.current.x-e.clientX);}}
        onPointerUp={e=>{drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
        onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resize(width+(e.key==='ArrowLeft'?40:-40));}}}
      />}
      <div className="modal-inner">
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭对话框"
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success";
}) {
  return (
    <div className={"notice " + tone}>
      <Info size={17} />
      <div>{children}</div>
    </div>
  );
}
export function ExternalLink({
  url,
  children,
  className = "text-button",
  local = false,
}: {
  url: string;
  children: ReactNode;
  className?: string;
  local?: boolean;
}) {
  const href = safeUrl(url, local);
  return href ? (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={15} />
    </a>
  ) : null;
}
export function Empty({
  icon,
  heading,
  children,
  action,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{heading}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
