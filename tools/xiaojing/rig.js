// 小鲸's warp rig. Each moving part is a soft-weighted deformation of the original art (turn around a
// pivot, sway, lift, shift, squash), so parts bend the picture instead of tearing holes in it.
// Frames are pre-rendered into sprite sheets (rows of `cols` frames).
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sin = (k, t, ph = 0) => Math.sin(TAU * k * t + ph);
// Fin flaps twice in the middle of the loop and rests at its ends.
const flap = (t, amp) => amp * Math.sin(2 * TAU * t) * (0.5 - 0.5 * Math.cos(TAU * t));
// A smooth bump centred on c (width w each side), looping around t = 1.
const bump = (t, c, w) => {
  const d = Math.min(Math.abs(t - c), 1 - Math.abs(t - c));
  return d < w ? 0.5 + 0.5 * Math.cos((Math.PI * d) / w) : 0;
};
const sway = (amp, phase = 0, speed = 0.018, k = 1) => (t, y) => amp * Math.sin(TAU * k * t - y * speed + phase);

// ── the five drawn moods (coordinates: pixels of each card, see panels.js) ──────────────────────
// Head parts measured per card: the ahoge (tip → root along its inner edge), fin ears and bow (the
// work card's outline shifted to each card's ear tips), the neck the head tilts on.
const EAR_L = [[92, 304], [118, 262], [148, 214], [160, 182], [176, 178], [190, 214], [192, 268], [186, 302], [150, 312], [106, 314]];
const EAR_R = [[450, 186], [480, 186], [522, 203], [556, 222], [550, 240], [502, 258], [466, 260], [448, 242]];
const BOW = [[434, 138], [494, 138], [496, 190], [434, 190]];
const move = (poly, [dx, dy]) => poly.map(([x, y]) => [x + dx, y + dy]);
const HEAD = {
  work: { tip: [178, 74], inner: [[200, 50], [230, 35], [260, 35], [283, 47], [293, 60], [294, 82]], ears: [[0, 0], [0, 0], [0, 0]], neck: [330, 345], chin: 340 },
  smile: { tip: [170, 70], inner: [[183, 50], [200, 38], [217, 33], [233, 32], [250, 35], [267, 42], [277, 50], [283, 60], [286, 76]], ears: [[-9, -11], [-4, -14], [-3, -12]], neck: [345, 330], chin: 322 },
  sleep: { tip: [181, 70], inner: [[193, 50], [217, 37], [237, 33], [260, 36], [277, 45], [287, 55], [293, 67], [297, 80]], ears: [[-1, -7], [3, -2], [7, 2]], neck: [300, 335], chin: 330 },
  eat: { tip: [180, 70], inner: [[193, 50], [217, 37], [237, 33], [260, 37], [277, 47], [287, 57], [293, 72], [295, 78]], ears: [[1, -22], [0, -17], [0, -15]], neck: [345, 312], chin: 300 },
  grab: { tip: [165, 67], inner: [[183, 47], [207, 37], [230, 33], [250, 35], [267, 42], [277, 53], [282, 67], [283, 77]], ears: [[-9, -10], [-3, -19], [-8, -15]], neck: [345, 322], chin: 315 },
};
// The ahoge is cut out along its inner edge and drawn behind the headdress, so it can swing wide
// without dragging the frills.
function ahogeLayer(mood, angle) {
  const h = HEAD[mood], root = h.inner.at(-1);
  return {
    name: "ahoge",
    grow: 4,
    poly: [[h.tip[0] - 14, h.tip[1] + 8], [h.tip[0] - 14, -24], [root[0] + 8, -24], [root[0] + 8, root[1] - 30], [root[0] + 3, root[1] + 4], ...[...h.inner].reverse(), h.tip],
    parts: [{ name: "ahoge", type: "rotate", pivot: root, r0: 6, r1: 70, feather: 2, poly: [[-60, -60], [660, -60], [660, 520], [-60, 520]], angle }],
  };
}
function headParts(mood, m) {
  const h = HEAD[mood];
  const [dl, dr, db] = h.ears;
  const at = (p, d) => [p[0] + d[0], p[1] + d[1]];
  return [
    // outer parts first: the whole head tilts on the neck, the upper body breathes
    ...(m.head ? [{ name: "head", outer: true, type: "rotate", pivot: h.neck, r0: 40, r1: 220, feather: 26, poly: [[-60, -60], [660, -60], [660, h.chin], [-60, h.chin]], angle: m.head }] : []),
    ...(m.breath ? [{ name: "breath", outer: true, type: "lift", feather: 16, poly: [[-60, -60], [660, -60], [660, 520], [-60, 520]], minus: m.still, y0: h.chin, y1: 470, dy: m.breath }] : []),
    { name: "earL", type: "rotate", pivot: at([180, 245], dl), r0: 18, r1: 90, feather: 6, poly: move(EAR_L, dl), angle: m.earL },
    { name: "earR", type: "rotate", pivot: at([462, 214], dr), r0: 12, r1: 75, feather: 6, poly: move(EAR_R, dr), angle: m.earR },
    { name: "bow", type: "rotate", pivot: at([452, 170], db), r0: 4, r1: 30, feather: 4, poly: move(BOW, db), angle: m.bow },
    { name: "hairL", type: "sway", feather: 12, y0: 340, y1: 450, poly: [[-40, 330], [60, 318], [150, 300], [205, 330], [215, 480], [-40, 480]], amp: m.hairL },
    { name: "hairR", type: "sway", feather: 12, y0: 350, y1: 450, poly: [[440, 280], [520, 268], [640, 300], [640, 480], [450, 480], [430, 380]], amp: m.hairR },
  ];
}
// Blinks swap in a copy of the art with the eyes closed (lids painted in skin, a lash line on top)
// for one frame at each time in `at`. eyes: [cx, cy, rx, ry, outer corner side]; tilt of the face.
const blink = (tilt, at, ...eyes) => ({ tilt, at, eyes });
const typing = (t) => ((t > 0.05 && t < 0.45) || (t > 0.6 && t < 0.86) ? Math.abs(sin(8, t)) : 0);

const MOODS = {
  // paw on her cheek tapping, the other paw typing behind the laptop
  work: {
    frames: 32, seconds: 3.2,
    parts: [
      ...headParts("work", {
        head: (t) => 1.2 * sin(1, t),
        breath: (t) => 0.9 * sin(1, t),
        still: [[226, 352], [476, 352], [476, 470], [226, 470]], // the laptop stays put
        earL: (t) => flap(t, 5),
        earR: (t) => -flap(t + 0.02, 5),
        bow: (t) => 4 * sin(1, t, 1.6),
        hairL: sway(2.4),
        hairR: sway(2.4, 0.6),
      }),
      { name: "cheekPaw", type: "rotate", pivot: [268, 352], r0: 6, r1: 45, feather: 3,
        poly: [[244, 300], [262, 296], [292, 306], [296, 330], [298, 356], [262, 360], [238, 352], [242, 325]],
        angle: (t) => -3 * (bump(t, 0.22, 0.06) + bump(t, 0.34, 0.06)) },
      { name: "typingPaw", type: "shift", feather: 3, poly: [[396, 330], [442, 330], [442, 353], [396, 353]], d: (t) => [0, -2.4 * typing(t)] },
    ],
    layers: [ahogeLayer("work", (t) => 8 * sin(1, t, -1))],
    blink: blink(-8, [0.58], [285, 281, 34, 21, -1], [390, 266, 27, 21, 1]),
  },
  // both chubby paws open beside her face, waving out of step
  smile: {
    frames: 24, seconds: 2.4,
    parts: [
      ...headParts("smile", {
        head: (t) => 1.6 * sin(1, t),
        breath: (t) => 0.8 * sin(2, t),
        earL: (t) => 5 * sin(2, t),
        earR: (t) => -5 * sin(2, t, 0.3),
        bow: (t) => 5 * sin(2, t, 1),
        hairL: sway(2.6, 0, 0.018, 2),
        hairR: sway(2.6, 0.6, 0.018, 2),
      }),
      { name: "laugh", type: "scale", center: [350, 296], feather: 4, poly: [[328, 280], [374, 280], [374, 314], [328, 314]], scale: (t) => [1, 1 + 0.09 * sin(4, t)] },
      { name: "pawL", type: "rotate", pivot: [262, 360], r0: 8, r1: 55, feather: 4,
        poly: [[197, 318], [210, 300], [228, 293], [255, 298], [268, 310], [272, 330], [282, 352], [278, 378], [250, 382], [222, 372], [205, 355], [197, 340]],
        angle: (t) => 9 * sin(2, t) },
      { name: "pawR", type: "rotate", pivot: [430, 346], r0: 8, r1: 55, feather: 4,
        poly: [[402, 300], [418, 282], [445, 276], [470, 280], [486, 300], [480, 330], [470, 352], [450, 362], [420, 362], [404, 345]],
        angle: (t) => -9 * sin(2, t, 0.8) },
    ],
    layers: [ahogeLayer("smile", (t) => 10 * sin(2, t, -1))],
  },
  // head on her paw, slow breaths, the mouth puffing with each one
  sleep: {
    frames: 32, seconds: 4.8,
    parts: [
      ...headParts("sleep", {
        head: (t) => 1.3 * sin(1, t, -0.6) - 0.8 * bump(t, 0.8, 0.08),
        breath: (t) => 1.8 * sin(1, t),
        earL: (t) => 2.5 * sin(1, t),
        earR: (t) => -2.5 * sin(1, t, 0.4),
        bow: (t) => 3 * sin(1, t, 1),
        hairL: sway(1.4),
        hairR: sway(1.4, 0.6),
      }),
      { name: "snore", type: "scale", center: [358, 305], feather: 3, poly: [[346, 296], [370, 296], [370, 316], [346, 316]], scale: (t) => [1, 0.85 + 0.3 * (0.5 + 0.5 * sin(1, t))] },
      { name: "tablePaw", type: "rotate", pivot: [426, 424], r0: 4, r1: 50, feather: 3,
        poly: [[352, 402], [420, 398], [430, 410], [428, 440], [352, 442]],
        angle: (t) => 3 * bump(t, 0.72, 0.05) },
    ],
    layers: [ahogeLayer("sleep", (t) => -4 + 5 * sin(1, t, -1.2))],
  },
  // chopsticks lift the rice ball to her mouth and back while she chews; the bowl bobs
  eat: {
    frames: 24, seconds: 2.4,
    parts: [
      ...headParts("eat", {
        head: (t) => 1.0 * sin(2, t),
        breath: (t) => 0.7 * sin(1, t),
        earL: (t) => 4 * sin(2, t),
        earR: (t) => -4 * sin(2, t, 0.3),
        bow: (t) => 4 * sin(2, t, 1),
        hairL: sway(2),
        hairR: sway(2, 0.6),
      }),
      { name: "chew", type: "scale", center: [346, 282], feather: 4, poly: [[326, 272], [368, 272], [368, 292], [326, 292]], scale: (t) => [1 + 0.04 * Math.max(0, sin(3, t)), 1 - 0.14 * Math.max(0, sin(3, t))] },
      { name: "bowl", type: "shift", feather: 5, poly: [[293, 322], [412, 322], [432, 352], [428, 404], [292, 404]], d: (t) => [0, 1.4 * sin(1, t, 1)] },
      { name: "chopsticks", type: "rotate", pivot: [258, 356], r0: 10, r1: 70, feather: 4,
        poly: [[198, 298], [234, 291], [262, 289], [318, 289], [345, 287], [347, 322], [318, 329], [288, 331], [290, 360], [255, 364], [226, 352], [224, 330], [198, 329]],
        angle: (t) => 4.5 * (0.5 - 0.5 * Math.cos(TAU * t)) },
    ],
    layers: [ahogeLayer("eat", (t) => 9 * sin(2, t, -1))],
  },
  // picked up: finger on her chin, the other paw open in a "huh?", head tilting, double blink
  grab: {
    frames: 32, seconds: 3.2,
    parts: [
      ...headParts("grab", {
        head: (t) => 2.6 * sin(1, t),
        breath: (t) => 0.6 * sin(2, t),
        earL: (t) => -4 + 3 * sin(1, t, 0.4),
        earR: (t) => 4 - 3 * sin(1, t, 0.4),
        bow: (t) => 5 * sin(1, t, 1.2),
        hairL: sway(3, 0, 0.014),
        hairR: sway(3, 0.5, 0.014),
      }),
      { name: "gape", type: "scale", center: [349, 289], feather: 3, poly: [[338, 279], [360, 279], [360, 299], [338, 299]], scale: (t) => [1, 1 + 0.12 * sin(2, t)] },
      { name: "chinPaw", type: "rotate", pivot: [296, 357], r0: 8, r1: 50, feather: 4,
        poly: [[262, 320], [272, 305], [290, 294], [306, 295], [314, 312], [320, 340], [318, 368], [295, 372], [265, 368], [255, 345]],
        angle: (t) => -3 * (bump(t, 0.12, 0.05) + bump(t, 0.24, 0.05) + bump(t, 0.66, 0.05)) },
      { name: "palm", type: "rotate", pivot: [425, 340], r0: 8, r1: 55, feather: 4,
        poly: [[405, 322], [420, 302], [445, 295], [468, 299], [494, 308], [495, 330], [472, 346], [452, 356], [430, 360], [407, 346]],
        angle: (t) => -6 * sin(1, t, 0.5) },
    ],
    layers: [ahogeLayer("grab", (t) => 11 * sin(1, t, -0.8))],
    blink: blink(-12, [0.42, 0.52], [277, 262, 32, 26, -1], [387, 238, 22, 23, 1]),
  },
};

// The separate tail layer (cropped at `box` in card pixels): the stem turns where it meets her hair
// (`base`), the big fluke turns at the notch, so the motion travels along it like a whip.
const TAIL_JOINTS = {
  work: { notch: [104, 326], base: [90, 394] },
  smile: { notch: [105, 314], base: [85, 382] },
  sleep: { notch: [95, 327], base: [92, 398] },
  eat: { notch: [104, 298], base: [85, 368] },
  grab: { notch: [96, 317], base: [82, 390] },
};
const TAIL_MOTION = {
  work: { frames: 32, seconds: 3.2, base: (t) => 2.5 * sin(1, t), fluke: (t) => 9 * sin(1, t, -1) + 8 * bump(t, 0.62, 0.1) },
  smile: { frames: 12, seconds: 0.8, base: (t) => 4 * sin(1, t), fluke: (t) => 14 * sin(1, t, -1.1) },
  sleep: { frames: 24, seconds: 4.8, base: (t) => -3 + 1.5 * sin(1, t), fluke: (t) => -10 + 3 * sin(1, t, -1) + 7 * bump(t, 0.5, 0.06) },
  eat: { frames: 16, seconds: 1.2, base: (t) => 3 * sin(1, t), fluke: (t) => 11 * sin(1, t, -1.2) + 3 * sin(3, t) },
  grab: { frames: 16, seconds: 1.6, base: (t) => -5 + 3 * sin(1, t), fluke: (t) => -16 + 7 * sin(1, t, -1.3) },
};
export function tailRig(mood, [tx, ty]) {
  const { notch, base } = TAIL_JOINTS[mood], m = TAIL_MOTION[mood];
  const n = [notch[0] - tx, notch[1] - ty], b = [base[0] - tx, base[1] - ty];
  return {
    frames: m.frames, seconds: m.seconds, cols: m.frames, pad: 30,
    parts: [
      { name: "stem", type: "rotate", pivot: b, r0: 8, r1: 80, feather: 4, poly: [[-80, -80], [300, -80], [300, 300], [-80, 300]], angle: m.base },
      { name: "fluke", type: "rotate", pivot: n, r0: 6, r1: 50, feather: 6, poly: [[-80, -80], [n[0] + 6, -80], [n[0] + 6, n[1] + 2], [-80, n[1] + 2]], angle: m.fluke },
    ],
  };
}

// ── the two original pictures (508x415 pout, 610x529 rage) keep their own rigs ──────────────────
const POUT_PARTS = (m) => [
  { name: "tail", type: "rotate", pivot: [108, 316], r0: 18, r1: 72, feather: 6,
    poly: [[-30, 222], [45, 226], [90, 260], [112, 288], [117, 318], [101, 334], [72, 340], [58, 352], [30, 348], [-30, 336]],
    angle: m.tail },
  { name: "ahoge", type: "rotate", pivot: [250, 62], r0: 10, r1: 58, feather: 5,
    poly: [[120, -30], [266, -30], [271, 38], [262, 62], [236, 70], [120, 74]],
    angle: m.ahoge },
  { name: "finL", type: "rotate", pivot: [208, 226], r0: 22, r1: 92, feather: 6,
    poly: [[40, 186], [160, 180], [212, 190], [222, 214], [214, 246], [160, 268], [110, 288], [40, 296]],
    angle: m.finL },
  { name: "finR", type: "rotate", pivot: [398, 213], r0: 14, r1: 70, feather: 6,
    poly: [[392, 178], [450, 176], [505, 186], [530, 212], [480, 238], [420, 242], [392, 237]],
    angle: m.finR },
  { name: "bow", type: "rotate", pivot: [416, 146], r0: 4, r1: 26, feather: 4,
    poly: [[390, 116], [446, 116], [450, 172], [390, 174]],
    angle: m.bow },
  { name: "hairL", type: "sway", feather: 10, y0: 280, y1: 415,
    poly: [[-30, 336], [50, 324], [110, 298], [160, 288], [186, 300], [190, 360], [182, 445], [-30, 445]],
    amp: m.hairL },
  { name: "hairR", type: "sway", feather: 10, y0: 240, y1: 415,
    poly: [[396, 240], [450, 230], [495, 250], [540, 290], [540, 445], [398, 445], [392, 330]],
    amp: m.hairR },
  { name: "breath", type: "lift", feather: 12, poly: [[188, 284], [398, 284], [398, 445], [188, 445]], dy: m.breath },
];

export const RIGS = {
  ...MOODS,
  pout: {
    frames: 24, seconds: 2.4,
    parts: POUT_PARTS({
      tail: (t) => 6 * sin(1, t),
      ahoge: (t) => 7 * sin(1, t, -1),
      finL: (t) => flap(t, 5),
      finR: (t) => -flap(t + 0.02, 5),
      bow: (t) => 5 * sin(1, t, 1.6),
      hairL: sway(2.6),
      hairR: sway(2.6, 0.6),
      breath: (t) => 0.9 * sin(1, t),
    }),
  },
  // the >_< picture: throbbing anger mark, quivering ahoge, flapping fins
  rage: {
    frames: 16, seconds: 1.2,
    parts: [
      { name: "anger", type: "scale", center: [100, 110], feather: 6,
        poly: [[44, 52], [158, 52], [158, 168], [44, 168]],
        scale: (t) => 1 + 0.16 * Math.max(0, sin(2, t)) ** 2 },
      { name: "ahoge", type: "rotate", pivot: [286, 60], r0: 10, r1: 62, feather: 5,
        poly: [[140, -30], [294, -30], [298, 40], [288, 64], [250, 80], [140, 84]],
        angle: (t) => 4 * sin(2, t) },
      { name: "finL", type: "rotate", pivot: [228, 248], r0: 22, r1: 100, feather: 6,
        poly: [[20, 222], [150, 220], [232, 226], [240, 256], [200, 300], [120, 322], [20, 326]],
        angle: (t) => 4 * sin(2, t) },
      { name: "finR", type: "rotate", pivot: [505, 228], r0: 14, r1: 80, feather: 6,
        poly: [[498, 194], [560, 190], [632, 198], [636, 236], [560, 262], [505, 262]],
        angle: (t) => -4 * sin(2, t) },
      { name: "hairL", type: "sway", feather: 10, y0: 240, y1: 400,
        poly: [[-30, 236], [80, 234], [160, 318], [166, 380], [60, 394], [-30, 400]],
        amp: sway(2, 0, 0.02) },
      { name: "hairR", type: "sway", feather: 10, y0: 250, y1: 470,
        poly: [[505, 262], [570, 250], [640, 280], [640, 490], [520, 490], [512, 380]],
        amp: sway(2, 0.7, 0.02) },
    ],
  },
};

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * W + clamp(x, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / (2 * r + 1);
      acc += src[y * W + clamp(x + r + 1, 0, W - 1)] - src[y * W + clamp(x - r, 0, W - 1)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / (2 * r + 1);
      acc += tmp[clamp(y + r + 1, 0, H - 1) * W + x] - tmp[clamp(y - r, 0, H - 1) * W + x];
    }
  }
  return out;
}
// Weight of a part over the padded canvas, in source pixels.
function weights(part, W, H, pad) {
  const GW = W + 2 * pad, GH = H + 2 * pad, m = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx - pad, y = gy - pad;
    m[gy * GW + gx] = inPoly(x, y, part.poly) && !(part.minus && inPoly(x, y, part.minus)) ? 1 : 0;
  }
  let w = m;
  for (let k = 0; k < 3; k++) w = boxBlur(w, GW, GH, Math.max(1, Math.round(part.feather / 2)));
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx - pad, y = gy - pad, i = gy * GW + gx;
    if (part.type === "rotate") {
      const s = clamp((Math.hypot(x - part.pivot[0], y - part.pivot[1]) - part.r0) / (part.r1 - part.r0));
      w[i] *= s * s * (3 - 2 * s);
    } else if (part.type === "sway") {
      w[i] *= clamp((y - part.y0) / (part.y1 - part.y0));
    } else if (part.type === "lift" && part.y1 !== undefined) {
      w[i] *= clamp((part.y1 - y) / (part.y1 - part.y0));
    }
  }
  return w;
}
const toCanvas = async (src) => {
  if (typeof src !== "string") return src;
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
};
// Anti-aliased coverage of a polygon, 0..1 per pixel.
function coverage(poly, W, H) {
  const c = new OffscreenCanvas(W, H), g = c.getContext("2d");
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  const d = g.getImageData(0, 0, W, H).data, m = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}
// Premultiplied RGBA of a canvas, optionally scaled per pixel by a mask.
function premultiply(c, mask) {
  const W = c.width, H = c.height, d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const pm = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const m = mask ? mask[i] : 1, a = (d[i * 4 + 3] / 255) * m;
    pm[i * 4] = d[i * 4] * a; pm[i * 4 + 1] = d[i * 4 + 1] * a; pm[i * 4 + 2] = d[i * 4 + 2] * a; pm[i * 4 + 3] = d[i * 4 + 3] * m;
  }
  return pm;
}
// The same art with both eyes shut: each eye is covered by a lid in the skin colour around it, and a
// soft downward lash line is drawn across with two lashes at the outer corner.
function closedEyes(src, { tilt, eyes }) {
  const W = src.width, H = src.height, out = new OffscreenCanvas(W, H), g = out.getContext("2d");
  g.drawImage(src, 0, 0);
  const d = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const skinNear = (cx, cy, rx, ry, from, to) => {
    const px = [];
    for (let y = Math.round(cy + ry * from); y <= cy + ry * to; y++) for (let x = Math.round(cx - rx * 1.3); x <= cx + rx * 1.3; x++) {
      const p = (y * W + x) * 4, r = d[p], gg = d[p + 1], b = d[p + 2];
      if (d[p + 3] > 250 && r > 225 && gg > 185 && b > 175 && r >= b) px.push([r, gg, b]);
    }
    px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    return px.length ? px[Math.floor(px.length * 0.6)] : [253, 232, 224];
  };
  const a = (tilt * Math.PI) / 180;
  for (const [cx, cy, rx, ry, side] of eyes) {
    const top = skinNear(cx, cy, rx, ry, -1.6, -0.4), low = skinNear(cx, cy, rx, ry, 1.1, 1.8);
    const lid = new OffscreenCanvas(W, H), lg = lid.getContext("2d");
    lg.filter = "blur(1.6px)";
    lg.translate(cx, cy);
    lg.rotate(a);
    const grad = lg.createLinearGradient(0, -ry, 0, ry);
    grad.addColorStop(0, `rgb(${top})`);
    grad.addColorStop(1, `rgb(${low})`);
    lg.fillStyle = grad;
    lg.beginPath();
    lg.ellipse(0, 0, rx + 5, ry + 3, 0, 0, Math.PI * 2);
    lg.fill();
    g.save();
    g.globalCompositeOperation = "source-atop";
    g.drawImage(lid, 0, 0);
    g.restore();
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.strokeStyle = "#2a2140";
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = 4.2;
    g.beginPath();
    g.moveTo(-rx * 0.92, ry * 0.18);
    g.quadraticCurveTo(0, ry * 0.72, rx * 0.92, ry * 0.18);
    g.stroke();
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(side * rx * 0.86, ry * 0.3);
    g.lineTo(side * rx * 1.08, ry * 0.52);
    g.moveTo(side * rx * 0.68, ry * 0.44);
    g.lineTo(side * rx * 0.82, ry * 0.7);
    g.stroke();
    g.restore();
  }
  return out;
}

// rig: { frames, seconds, parts, layers?, blink? }. Layers are cut out of the art along their polygon
// and drawn behind it, moved by the rig's outer parts (head, breath) and then by their own parts.
export async function renderSprite(src, rig, { scale = 0.66, pad = rig.pad ?? 18, quality = 0.84, frames = rig.frames, cols = rig.cols ?? 8 } = {}) {
  const art = await toCanvas(src);
  const W = art.width, H = art.height, N = W * H;
  const px = art.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const layers = (rig.layers || []).map((l) => {
    const mask = coverage(l.poly, W, H);
    // `grow`: also take the dark outline just outside the polygon, so no edge of it stays behind
    if (l.grow) {
      const base = mask.slice();
      for (let i = 0; i < N; i++) {
        if (base[i] > 0.5 || px[i * 4 + 3] === 0 || 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2] > 150) continue;
        const x = i % W, y = (i / W) | 0;
        search: for (let dy = -l.grow; dy <= l.grow; dy++) for (let dx = -l.grow; dx <= l.grow; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && base[ny * W + nx] > 0.5) { mask[i] = 1; break search; }
        }
      }
    }
    return { ...l, mask };
  });
  const rest = new Float32Array(N).fill(1);
  for (const l of layers) for (let i = 0; i < N; i++) rest[i] *= 1 - l.mask[i];
  const pm = premultiply(art, rest);
  const pmShut = rig.blink ? premultiply(closedEyes(art, rig.blink), rest) : null;
  const shutFrames = new Set((rig.blink?.at || []).map((t) => Math.round(t * frames) % frames));
  for (const l of layers) l.pm = premultiply(art, l.mask);
  const GW = W + 2 * pad, GH = H + 2 * pad;
  const wmaps = rig.parts.map((p) => weights(p, W, H, pad));
  for (const l of layers) l.wmaps = l.parts.map((p) => weights(p, W, H, pad));
  const outer = rig.parts.map((p, k) => [p, k]).filter(([p]) => p.outer);
  const FW = Math.round(GW * scale), FH = Math.round(GH * scale);
  cols = Math.min(cols, frames);
  const rows = Math.ceil(frames / cols);
  const out = new OffscreenCanvas(FW * cols, FH * rows);
  const og = out.getContext("2d");
  const fd = og.createImageData(FW, FH);
  const acc = [0, 0, 0, 0];
  const sample = (P, x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    acc[0] = acc[1] = acc[2] = acc[3] = 0;
    for (const [dx, dy, k] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const sx = x0 + dx, sy = y0 + dy;
      if (k === 0 || sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const i = (sy * W + sx) * 4;
      acc[0] += P[i] * k; acc[1] += P[i + 1] * k; acc[2] += P[i + 2] * k; acc[3] += P[i + 3] * k;
    }
    return acc;
  };
  const value = (p, t) =>
    p.type === "rotate" ? (p.angle(t) * Math.PI) / 180
    : p.type === "scale" ? [p.scale(t)].flat()
    : p.type === "lift" ? p.dy(t)
    : p.type === "shift" ? p.d(t)
    : 0;
  // Moves (X, Y) backwards through one part.
  const apply = (p, v, wmap, t, X, Y) => {
    const gx = Math.round(X + pad), gy = Math.round(Y + pad);
    const w = gx >= 0 && gy >= 0 && gx < GW && gy < GH ? wmap[gy * GW + gx] : 0;
    if (w <= 0.001) return [X, Y];
    if (p.type === "rotate") {
      const a = -v * w, c = Math.cos(a), s = Math.sin(a), dx = X - p.pivot[0], dy = Y - p.pivot[1];
      return [p.pivot[0] + dx * c - dy * s, p.pivot[1] + dx * s + dy * c];
    }
    if (p.type === "sway") return [X - p.amp(t, Y) * w, Y];
    if (p.type === "lift") return [X, Y + v * w];
    if (p.type === "shift") return [X - v[0] * w, Y - v[1] * w];
    const [sx, sy = sx] = v, kx = 1 + (sx - 1) * w, ky = 1 + (sy - 1) * w;
    return [p.center[0] + (X - p.center[0]) / kx, p.center[1] + (Y - p.center[1]) / ky];
  };
  for (let f = 0; f < frames; f++) {
    const t = f / frames;
    const vals = rig.parts.map((p) => value(p, t));
    for (const l of layers) l.vals = l.parts.map((p) => value(p, t));
    const P = pmShut && shutFrames.has(f) ? pmShut : pm;
    const d = fd.data;
    for (let v = 0; v < FH; v++) for (let u = 0; u < FW; u++) {
      const X0 = (u + 0.5) / scale - pad, Y0 = (v + 0.5) / scale - pad;
      let X = X0, Y = Y0;
      rig.parts.forEach((p, k) => ([X, Y] = apply(p, vals[k], wmaps[k], t, X, Y)));
      let [r, g, b, a] = sample(P, X, Y);
      // layers sit behind: they show wherever the art in front is not yet opaque
      for (const l of layers) {
        if (a >= 254.5) break;
        let lx = X0, ly = Y0;
        for (const [p, k] of outer) [lx, ly] = apply(p, vals[k], wmaps[k], t, lx, ly);
        l.parts.forEach((p, k) => ([lx, ly] = apply(p, l.vals[k], l.wmaps[k], t, lx, ly)));
        const [lr, lgr, lb, la] = sample(l.pm, lx, ly), keep = 1 - a / 255;
        r += lr * keep; g += lgr * keep; b += lb * keep; a += la * keep;
      }
      const o = (v * FW + u) * 4;
      if (a < 0.5) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
      d[o] = (r / a) * 255; d[o + 1] = (g / a) * 255; d[o + 2] = (b / a) * 255; d[o + 3] = a;
    }
    og.putImageData(fd, (f % cols) * FW, Math.floor(f / cols) * FH);
  }
  const blob = await out.convertToBlob({ type: "image/webp", quality });
  const url = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
  return { url, frameWidth: FW, frameHeight: FH, frames, cols, rows, pad, W, H, seconds: rig.seconds };
}
