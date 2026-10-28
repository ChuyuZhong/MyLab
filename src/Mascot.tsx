import { useEffect, useId, useState, type CSSProperties } from "react";
import LAYOUT from "./xiaojing-layout.json";
import type { Mood } from "./mascot-mood";

// 小鲸 is drawn from the reference art itself (tools/xiaojing): five moods from one sheet of cards
// plus the two original pictures (pout, rage). Every mood sits in the same frame with her head in
// the same place; each has a body sheet of pre-rendered warp frames (head, ahoge, fin ears, bow, hair,
// paws, blinks), a tail sheet swinging behind it, and its floating effects as separate pieces.
const FILES = import.meta.glob("./assets/xiaojing/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const url = (file: string) => FILES[`./assets/xiaojing/${file}`];
type Box = number[];
type Sheet = { file: string; box: Box; frames: number; cols: number; rows: number; seconds: number };
type MoodArt = { still: { file: string; box: Box }; body: Sheet; tail?: Sheet; fx: { name: string; file: string; box: Box }[]; face: number[]; glow?: Box };
const MOODS = LAYOUT.moods as Record<Mood, MoodArt>;
export const ART = { w: LAYOUT.art[0], h: LAYOUT.art[1] };
const FADE_MS = 340;

const place = ([x, y, w, h]: Box): CSSProperties => ({
  left: `${(x / ART.w) * 100}%`,
  top: `${(y / ART.h) * 100}%`,
  width: `${(w / ART.w) * 100}%`,
  height: `${(h / ART.h) * 100}%`,
});
// A sheet of `cols` x `rows` frames: one animation steps across a row, a second steps down the rows.
function sheetStyle(s: Sheet, tempo = 1) {
  return {
    ...place(s.box),
    backgroundImage: `url(${url(s.file)})`,
    backgroundSize: `${s.cols * 100}% ${s.rows * 100}%`,
    "--xj-cols": s.cols,
    "--xj-rows": s.rows,
    "--xj-endx": `${(s.cols / (s.cols - 1)) * 100}%`,
    "--xj-endy": s.rows > 1 ? `${(s.rows / (s.rows - 1)) * 100}%` : "0%",
    animationDuration: `${(s.seconds * tempo) / s.rows}s, ${s.seconds * tempo}s`,
  } as CSSProperties;
}

// Tears that keep falling from the two original pictures (in their own pixels).
const DRIPS: Partial<Record<Mood, { size: [number, number]; at: [number, number][] }>> = {
  pout: { size: [508, 415], at: [[236, 297], [372, 318]] },
  rage: { size: [610, 529], at: [[233, 350], [446, 304]] },
};
function Drips({ mood, box }: { mood: Mood; box: Box }) {
  const id = "xj-tear" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = DRIPS[mood];
  if (!d) return null;
  return (
    <svg className="xj-drips" viewBox={`0 0 ${d.size[0]} ${d.size[1]}`} style={place(box)}>
      <defs>
        <radialGradient id={id} cx=".35" cy=".3">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#8fd0ff" />
        </radialGradient>
      </defs>
      {d.at.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path
            className="xj-drip"
            style={{ animationDelay: `${i * 0.55}s` }}
            d="M0,-7 C3,-2 5,1 5,4 A5,5 0 0 1 -5,4 C-5,1 -3,-2 0,-7 Z"
            fill={`url(#${id})`}
            stroke="#5aa9ef"
            strokeWidth="1.2"
          />
        </g>
      ))}
    </svg>
  );
}

function MoodLayer({ mood, busy, still, phase }: { mood: Mood; busy: boolean; still: boolean; phase: "" | "enter" | "leave" }) {
  const art = MOODS[mood];
  return (
    <span className={`xj-layer xj-${mood}${phase ? ` xj-${phase}` : ""}`}>
      <span className="xj-pose">
        {!still && art.tail && <span className="xj-sprite" style={sheetStyle(art.tail)} />}
        {still ? (
          <img className="xj-still-art" src={url(art.still.file)} style={place(art.still.box)} alt="" draggable={false} />
        ) : (
          <span className="xj-sprite" style={sheetStyle(art.body, busy ? 0.6 : 1)} />
        )}
        {busy && art.glow && <span className="xj-glow" style={place(art.glow)} />}
        <Drips mood={mood} box={art.still.box} />
        {art.fx.map((e) => (
          <img key={e.name} className={`xj-fx xj-fx-${e.name}`} src={url(e.file)} style={place(e.box)} alt="" draggable={false} />
        ))}
      </span>
    </span>
  );
}

export function Xiaojing({
  mood = "work",
  busy = false,
  still = false,
  talk = false,
  className = "",
  style,
}: {
  mood?: Mood;
  busy?: boolean;
  still?: boolean;
  talk?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  // A new mood fades in over the old one instead of popping.
  const [shown, setShown] = useState([{ mood, key: 0 }]);
  const top = shown[shown.length - 1];
  if (top.mood !== mood) setShown([top, { mood, key: top.key + 1 }]);
  useEffect(() => {
    if (shown.length < 2) return;
    const id = setTimeout(() => setShown((s) => s.slice(-1)), FADE_MS);
    return () => clearTimeout(id);
  }, [shown]);
  const layers = still ? [{ mood, key: top.key }] : shown;
  return (
    <span
      className={`xj${busy ? " xj-busy" : ""}${still ? " xj-still" : ""}${talk ? " xj-talk" : ""} ${className}`}
      style={{ aspectRatio: `${ART.w} / ${ART.h}`, ...style }}
      aria-hidden="true"
    >
      {layers.map((l, i) => (
        <MoodLayer
          key={l.key}
          mood={l.mood}
          busy={busy}
          still={still}
          phase={layers.length < 2 ? "" : i === layers.length - 1 ? "enter" : "leave"}
        />
      ))}
    </span>
  );
}

// A square crop centred on her face.
export function XiaojingAvatar({ mood = "work", busy = false, className = "" }: { mood?: Mood; busy?: boolean; className?: string }) {
  const [cx, cy, side] = MOODS[mood].face;
  return (
    <span className={`xj-avatar ${className}`}>
      <Xiaojing
        mood={mood}
        busy={busy}
        still
        style={{
          position: "absolute",
          width: `${(ART.w / side) * 100}%`,
          left: `${(-(cx - side / 2) / side) * 100}%`,
          top: `${(-(cy - side / 2) / side) * 100}%`,
        }}
      />
    </span>
  );
}

// A small whale glyph for the brand tile.
export function WhaleMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 17.5C5 11.7 10.3 8 16.3 8c5 0 8.8 2.6 10.2 6.4.5 1.4 1.6 2.2 2.9 2.4-.7 1.5-2 2.4-3.4 2.6C24.4 23.3 20.4 25 15.6 25 9.7 25 5 22.2 5 17.5Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M14 8.5c-.8-3 1-5 3.3-4.4 1.8.5 1.6 2.8-.2 2.7" />
      <circle cx="11" cy="15.6" r="1.5" fill="var(--wm-eye, #1b2a7a)" />
      <path fill="none" stroke="var(--wm-eye, #1b2a7a)" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" d="M8 20.5c3.5 1.8 9 2 13.5.2" />
    </svg>
  );
}
