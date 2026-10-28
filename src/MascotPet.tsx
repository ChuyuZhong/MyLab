import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ART, Xiaojing } from "./Mascot";
import { HOVER_LINES, emitMascot, useMascot } from "./mascot-mood";

// 小鲸 sits in a small pool of water that can be dropped anywhere on the page (the water also
// hides the flat bottom edge of the art). Dragging lifts her out by the head: she dangles with a
// dazed face and swings with the pointer. While the chat panel is open she waits beside it.
const KEY = "mylab.pet";
type Spot = { x: number; y: number }; // bottom centre of the pool, in viewport px

function metrics() {
  const fw = innerWidth < 650 ? 134 : 180;
  const fh = (fw * ART.h) / ART.w,
    water = fw * 0.26;
  return { fw, fh, water, bw: fw * 1.26, bh: fh + water * 0.3, lift: water * 0.3 };
}
const clampSpot = ({ x, y }: Spot): Spot => {
  const { bw, bh } = metrics();
  return {
    x: Math.min(Math.max(x, bw / 2 + 4), innerWidth - bw / 2 - 4),
    y: Math.min(Math.max(y, bh + 4), innerHeight - 2),
  };
};
function loadSpot(): Spot {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Number.isFinite(s.fx) && Number.isFinite(s.fy)) return clampSpot({ x: s.fx * innerWidth, y: s.fy * innerHeight });
  } catch {}
  const { bw } = metrics();
  return clampSpot({ x: innerWidth - 22 - bw / 2, y: innerHeight - 4 });
}
function saveSpot(s: Spot) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ fx: s.x / innerWidth, fy: s.y / innerHeight }));
  } catch {}
}
// Beside the chat panel's lower-left corner, tucked slightly behind it (null when there is no room).
function perchSpot(): Spot | null {
  if (innerWidth < 900) return null;
  const { bw } = metrics();
  const panelLeft = innerWidth - 20 - Math.min(410, innerWidth - 30);
  const x = panelLeft - bw * 0.26;
  return x - bw / 2 < 8 ? null : { x, y: innerHeight - 20 };
}

export function MascotPet({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const mascot = useMascot();
  const [spot, setSpot] = useState(loadSpot);
  const [, setViewport] = useState(0);
  const [drag, setDrag] = useState<{ px: number; py: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [talk, setTalk] = useState(false);
  const [landing, setLanding] = useState(0);
  const figure = useRef<HTMLSpanElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const swing = useRef({ angle: 0, vel: 0, vx: 0, lastX: 0, raf: 0, held: false });
  const m = metrics();

  useEffect(() => {
    const resize = () => {
      setSpot((s) => clampSpot(s));
      setViewport((n) => n + 1);
    };
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!mascot.line) return;
    setTalk(true);
    const id = setTimeout(() => setTalk(false), 1500);
    return () => clearTimeout(id);
  }, [mascot.line]);
  useEffect(() => () => cancelAnimationFrame(swing.current.raf), []);

  // A damped pendulum around her head; the target angle follows the pointer's horizontal speed.
  function runSwing() {
    const s = swing.current;
    if (s.raf) return;
    const tick = () => {
      const target = s.held ? Math.max(-32, Math.min(32, -s.vx * 1.7)) : 0;
      s.vx *= 0.82;
      s.vel = (s.vel + (target - s.angle) * 0.09) * 0.86;
      s.angle += s.vel;
      if (figure.current) figure.current.style.transform = `rotate(${s.angle.toFixed(2)}deg)`;
      if (s.held || Math.abs(s.angle) > 0.15 || Math.abs(s.vel) > 0.05) s.raf = requestAnimationFrame(tick);
      else {
        s.raf = 0;
        s.angle = s.vel = 0;
        if (figure.current) figure.current.style.transform = "";
      }
    };
    s.raf = requestAnimationFrame(tick);
  }
  const grabY = m.fh * 0.12; // she is held just above her headdress
  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!press.current) return;
    if (!drag && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) < 6) return;
    const s = swing.current;
    if (!drag) {
      emitMascot("grab");
      s.held = true;
      s.lastX = e.clientX;
      setHover(false);
    }
    s.vx = s.vx * 0.5 + (e.clientX - s.lastX) * 0.5;
    s.lastX = e.clientX;
    setDrag({ px: e.clientX, py: e.clientY });
    runSwing();
  }
  function release(e: PointerEvent<HTMLButtonElement>) {
    press.current = null;
    if (!drag) return;
    const next = clampSpot({ x: e.clientX, y: e.clientY - grabY + m.bh });
    setSpot(next);
    saveSpot(next);
    setDrag(null);
    setLanding((n) => n + 1);
    swing.current.held = false;
    suppressClick.current = true;
    emitMascot("drop");
    runSwing();
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 96 : 32;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || open) return;
    e.preventDefault();
    const next = clampSpot({ x: spot.x + d[0], y: spot.y + d[1] });
    setSpot(next);
    saveSpot(next);
  }

  const perch = open ? perchSpot() : null;
  if (open && !perch && !drag) return null;
  const at = drag ? { x: drag.px, y: drag.py - grabY + m.bh } : perch || spot;
  const line = mascot.line || (hover && !drag ? HOVER_LINES[mascot.mood] : "");
  const bubbleRight = at.x > innerWidth / 2;
  const style = {
    left: at.x - m.bw / 2,
    top: at.y - m.bh,
    width: m.bw,
    height: m.bh,
    "--pet-fw": `${m.fw}px`,
    "--pet-water": `${m.water}px`,
    "--pet-lift": `${m.lift}px`,
  } as CSSProperties;
  return (
    <div className={`pet${drag ? " pet-held" : ""}${perch && !drag ? " pet-perched" : ""}`} style={style}>
      <svg className="pet-water pet-water-back" viewBox="0 0 200 52" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id="pet-pool" cx=".5" cy=".45" r=".6">
            <stop offset="0" stopColor="#bfe7ff" stopOpacity=".95" />
            <stop offset="1" stopColor="#6aa7ff" stopOpacity=".55" />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="30" rx="97" ry="19" fill="url(#pet-pool)" />
        <ellipse className="pet-ripple" cx="100" cy="30" rx="70" ry="13" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />
        <ellipse className="pet-ripple" cx="100" cy="30" rx="70" ry="13" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" style={{ animationDelay: "1.4s" }} />
      </svg>
      {landing > 0 && (
        <span className="pet-splash" key={landing} aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
      )}
      <button
        type="button"
        className="pet-grip"
        aria-label="小鲸助手：点击聊天，拖动可以把她放到任意位置（方向键也能移动）"
        title="小鲸 · 点击聊天 · 拖动换位置"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onOpen();
        }}
        onKeyDown={onKeyDown}
      >
        <span className="pet-figure" ref={figure}>
          <Xiaojing mood={mascot.mood} busy={mascot.busy} talk={talk} />
          {drag && (
            <span className="pet-drips" aria-hidden="true">
              <i /><i /><i />
            </span>
          )}
        </span>
      </button>
      <svg className="pet-water pet-water-front" viewBox="0 0 200 52" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pet-wave" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9f1ff" />
            <stop offset=".35" stopColor="#8ec9ff" />
            <stop offset="1" stopColor="#4f86f5" />
          </linearGradient>
        </defs>
        <path
          className="pet-wave"
          d="M10 21C26 13 40 25 58 18S90 12 106 19S138 26 156 17S184 14 190 21L192 32A92 17 0 0 1 8 32Z"
          fill="url(#pet-wave)"
        />
        <path d="M22 21C34 16 44 23 58 19M92 17C102 15 110 20 120 19M150 19C162 14 172 17 182 20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".9" />
        <g fill="#fff" opacity=".85">
          <circle className="pet-bubble" cx="40" cy="34" r="2.2" />
          <circle className="pet-bubble" cx="150" cy="36" r="1.8" style={{ animationDelay: "1.1s" }} />
          <circle className="pet-bubble" cx="118" cy="40" r="1.4" style={{ animationDelay: "2s" }} />
        </g>
      </svg>
      {line && (
        <span className={`pet-say ${bubbleRight ? "left" : "right"}`} key={line}>
          {line}
        </span>
      )}
    </div>
  );
}
