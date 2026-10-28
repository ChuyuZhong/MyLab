// 小鲸's five drawn moods come from one sheet (tools/xiaojing/sheet.webp, five white cards). Each
// card is cut out of its background; its floating effects (sparkles, Zz, bubbles, heart, question
// marks) are lifted off into their own layers, and the tail is split from the body so it can swing
// behind her. Coordinates are pixels of the card crop (`rect` in the sheet).
export const SHEET = "/tools/xiaojing/sheet.webp";

// `place` puts a card into the shared 584x458 canvas (the work card's own frame): [x, y, scale],
// measured by matching the headdress and hair of each card against the work card.
export const PANELS = {
  work: {
    rect: [8, 0, 584, 458],
    floor: 457,
    place: [0, 0, 1],
    fx: { lines: [84, 210, 44, 46] },
    tail: {
      poly: [[20, 252], [45, 255], [80, 280], [100, 300], [108, 312], [150, 306], [165, 318], [160, 345], [130, 350], [122, 372], [110, 395], [60, 400], [40, 360], [20, 310]],
      seed: [60, 300],
      // where it would continue under her hair: the right fluke and the stem
      ext: [[[138, 306], [186, 300], [196, 334], [150, 352], [132, 344]], [[66, 376], [122, 372], [128, 424], [70, 424]]],
    },
  },
  smile: {
    rect: [596, 0, 584, 458],
    floor: 447,
    solid: [[[282, 392], [412, 392], [414, 447], [280, 447]]],
    place: [6.1, 10.1, 0.99],
    fx: { s1: [98, 169, 44, 46], s2: [469, 88, 42, 47], s3: [498, 142, 33, 36] },
    tail: {
      poly: [[25, 228], [62, 232], [95, 282], [102, 300], [150, 300], [165, 312], [160, 340], [125, 345], [115, 370], [100, 395], [50, 398], [30, 320]],
      seed: [62, 280],
      ext: [[[132, 300], [180, 296], [188, 330], [146, 344], [128, 336]], [[62, 362], [118, 360], [122, 412], [64, 412]]],
    },
  },
  sleep: {
    rect: [1183, 0, 584, 458],
    floor: 447,
    place: [1.2, 3.2, 0.99],
    fx: { z1: [520, 69, 26, 27], z2: [489, 106, 26, 28], b1: [526, 258, 26, 25], b2: [531, 290, 17, 17], b3: [511, 279, 16, 14] },
    tail: {
      poly: [[8, 258], [40, 262], [90, 300], [98, 312], [112, 296], [124, 300], [134, 330], [132, 355], [118, 378], [105, 402], [45, 402], [12, 330]],
      seed: [45, 300],
      ext: [[[118, 300], [150, 312], [150, 360], [126, 372]], [[64, 380], [124, 376], [128, 430], [66, 430]]],
    },
  },
  eat: {
    rect: [8, 466, 584, 416],
    floor: 412,
    place: [-3, 10, 1],
    fx: { heart: [94, 155, 40, 42] },
    tail: {
      poly: [[25, 215], [60, 218], [98, 272], [102, 288], [150, 284], [166, 296], [160, 322], [128, 326], [118, 350], [100, 375], [50, 378], [28, 300]],
      seed: [60, 260],
      ext: [[[136, 288], [184, 284], [192, 318], [148, 332], [130, 324]], [[60, 352], [116, 350], [120, 404], [62, 404]]],
    },
  },
  grab: {
    rect: [596, 466, 584, 416],
    floor: 412,
    place: [9.7, 11.6, 1 / 1.015],
    fx: { q1: [494, 94, 37, 57], q2: [96, 166, 40, 55] },
    tail: {
      poly: [[15, 252], [45, 255], [88, 290], [96, 300], [140, 293], [156, 300], [150, 340], [122, 350], [112, 372], [100, 395], [45, 398], [18, 320]],
      seed: [50, 300],
      ext: [[[128, 296], [176, 292], [184, 328], [140, 344], [122, 336]], [[58, 372], [116, 370], [120, 420], [60, 420]]],
    },
  },
};

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inBox = (x, y, [bx, by, bw, bh]) => x >= bx && y >= by && x < bx + bw && y < by + bh;
const canvas = (w, h) => {
  const c = new OffscreenCanvas(w, h);
  return [c, c.getContext("2d", { willReadFrequently: true })];
};
export async function toDataUrl(c, type = "image/png", quality) {
  const blob = await c.convertToBlob({ type, quality });
  return await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
}
const crop = (src, [x, y, w, h]) => {
  const [c, g] = canvas(w, h);
  g.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
};

// One card: the figure (with its tail) on transparency, the body without the tail, the tail with
// its hidden continuation painted in, and each effect on its own.
function cutPanel(sheet, cfg) {
  const [rx, ry, W, H] = cfg.rect, N = W * H;
  const [c, g] = canvas(W, H);
  g.drawImage(sheet, rx, ry, W, H, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data;
  const fxBoxes = Object.values(cfg.fx);
  // 1. background: light pixels reachable from the top and sides (the bottom is the card edge,
  //    where the art fades into white without an outline, so it is cut flat at `floor`)
  const light = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4, mn = Math.min(d[p], d[p + 1], d[p + 2]), mx = Math.max(d[p], d[p + 1], d[p + 2]);
    light[i] = ((i / W) | 0) < cfg.floor && mn >= 228 && mx - mn <= 26 ? 1 : 0;
  }
  // her apron runs into the white card at the bottom with no outline: keep it solid
  for (const poly of cfg.solid || []) for (let i = 0; i < N; i++) if (light[i] && inPoly(i % W, (i / W) | 0, poly)) light[i] = 0;
  const bg = new Uint8Array(N), q = new Int32Array(N);
  let qh = 0, qt = 0;
  const seed = (i) => {
    if (light[i] && !bg[i]) { bg[i] = 1; q[qt++] = i; }
  };
  for (let x = 0; x < W; x++) seed(x);
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i / W) | 0;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (y > 0) seed(i - W);
    if (y < H - 1) seed(i + W);
  }
  for (let i = (cfg.floor) * W; i < N; i++) bg[i] = 1;
  // 2. foreground pieces: effects are the ones inside an effect box, everything else is her
  const label = new Int32Array(N).fill(-1), isFx = [];
  for (let s = 0; s < N; s++) {
    if (bg[s] || label[s] >= 0) continue;
    const id = isFx.length;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    qh = qt = 0; q[qt++] = s; label[s] = id;
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!bg[j] && label[j] < 0) { label[j] = id; q[qt++] = j; }
      }
    }
    isFx.push(fxBoxes.some((b) => inBox(minX, minY, b) && inBox(maxX, maxY, b)));
  }
  const fig = new Uint8Array(N);
  for (let i = 0; i < N; i++) fig[i] = label[i] >= 0 && !isFx[label[i]] ? 1 : 0;
  // 3. alpha: outline pixels next to the background lose their white fringe
  const figure = new ImageData(new Uint8ClampedArray(d), W, H), f = figure.data;
  const touchesBg = (i) => {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0) return true;
      if (ny >= cfg.floor) continue; // the flat cut keeps its full alpha
      if (!fig[ny * W + nx]) return true;
    }
    return false;
  };
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    if (!fig[i]) { f[p + 3] = 0; continue; }
    if (!touchesBg(i)) continue;
    const mn = Math.min(f[p], f[p + 1], f[p + 2]), a = Math.max(0, Math.min(1, (255 - mn) / (255 - 120)));
    if (a < 1) {
      for (let k = 0; k < 3; k++) f[p + k] = Math.max(0, Math.min(255, (f[p + k] - (1 - a) * 255) / Math.max(a, 0.05)));
      f[p + 3] = Math.round(a * 255);
    }
  }
  // 4. effects: unmix each box from the white card
  const effects = {};
  for (const [name, [bx, by, bw, bh]] of Object.entries(cfg.fx)) {
    const e = new ImageData(bw, bh), ed = e.data;
    let core = 255;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = (by + y) * W + bx + x;
      if (label[i] >= 0 && isFx[label[i]]) core = Math.min(core, Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
    }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = (by + y) * W + bx + x, p = i * 4, o = (y * bw + x) * 4;
      if (fig[i]) continue;
      const mn = Math.min(d[p], d[p + 1], d[p + 2]), a = Math.max(0, Math.min(1, (255 - mn) / Math.max(30, 255 - core)));
      if (a < 0.04) continue;
      for (let k = 0; k < 3; k++) ed[o + k] = Math.max(0, Math.min(255, (d[p + k] - (1 - a) * 255) / a));
      ed[o + 3] = Math.round(a * 255);
    }
    const [ec, eg] = canvas(bw, bh);
    eg.putImageData(e, 0, 0);
    effects[name] = { canvas: ec, box: [bx, by, bw, bh] };
  }
  // 5. tail: the flat navy fill reachable from `seed` inside its polygon, plus its outline ring
  const T = cfg.tail, sp = (T.seed[1] * W + T.seed[0]) * 4, tc = [f[sp], f[sp + 1], f[sp + 2]];
  const navy = (i) => {
    const p = i * 4;
    return fig[i] && Math.hypot(f[p] - tc[0], f[p + 1] - tc[1], f[p + 2] - tc[2]) < 34;
  };
  const core = new Uint8Array(N);
  qh = qt = 0;
  const s0 = T.seed[1] * W + T.seed[0];
  core[s0] = 1; q[qt++] = s0;
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || core[j] || !navy(j) || !inPoly(nx, ny, T.poly)) continue;
      core[j] = 1; q[qt++] = j;
    }
  }
  const lum = (i) => 0.3 * f[i * 4] + 0.59 * f[i * 4 + 1] + 0.11 * f[i * 4 + 2];
  const near = (m, i, r) => {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && m[ny * W + nx]) return true;
    }
    return false;
  };
  const tail = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (core[i]) tail[i] = 1;
    else if (fig[i] && inPoly(i % W, (i / W) | 0, T.poly) && near(core, i, 5) && (lum(i) < 140 || f[i * 4 + 3] < 250 || navy(i)) && f[i * 4 + 2] - f[i * 4] < 50) tail[i] = 1;
  }
  // ring pixels that also edge her hair stay with the body, so the hair keeps its outline
  const other = new Uint8Array(N);
  for (let i = 0; i < N; i++) other[i] = fig[i] && !tail[i] ? 1 : 0;
  const body = new ImageData(new Uint8ClampedArray(f), W, H), bd = body.data;
  for (let i = 0; i < N; i++) if (tail[i] && (core[i] || !near(other, i, 3))) bd[i * 4 + 3] = 0;
  // crumbs of the tail's outline left floating once it moves
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (seen[s] || bd[s * 4 + 3] < 32 || !inPoly(s % W, (s / W) | 0, T.poly)) continue;
    const comp = [s];
    seen[s] = 1;
    for (let k = 0; k < comp.length && comp.length < 200; k++) {
      const i = comp[k], x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[j] || bd[j * 4 + 3] < 32) continue;
        seen[j] = 1;
        comp.push(j);
      }
    }
    if (comp.length < 200) for (const i of comp) bd[i * 4 + 3] = 0;
  }
  // tail layer: hidden continuation (only where her hair covers it), then the visible tail
  const [extC, extG] = canvas(W, H);
  extG.fillStyle = `rgb(${tc})`;
  extG.strokeStyle = "#1c1b33";
  extG.lineWidth = 3;
  extG.lineJoin = "round";
  for (const poly of T.ext) {
    extG.beginPath();
    poly.forEach(([x, y], i) => (i ? extG.lineTo(x, y) : extG.moveTo(x, y)));
    extG.closePath();
    extG.fill();
    extG.stroke();
  }
  const ext = extG.getImageData(0, 0, W, H).data;
  const tl = new ImageData(W, H), td = tl.data;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    let on = false;
    if (tail[i]) { td[p] = f[p]; td[p + 1] = f[p + 1]; td[p + 2] = f[p + 2]; td[p + 3] = f[p + 3]; on = true; }
    else if (ext[p + 3] > 0 && bd[p + 3] > 240 && !tail[i]) { td[p] = ext[p]; td[p + 1] = ext[p + 1]; td[p + 2] = ext[p + 2]; td[p + 3] = 255; on = true; }
    if (on) {
      const x = i % W, y = (i / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const [figC, figG] = canvas(W, H);
  figG.putImageData(figure, 0, 0);
  const [bodyC, bodyG] = canvas(W, H);
  bodyG.putImageData(body, 0, 0);
  const [tailFull, tailG] = canvas(W, H);
  tailG.putImageData(tl, 0, 0);
  const tbox = [minX - 2, minY - 2, maxX - minX + 5, maxY - minY + 5];
  return { figure: figC, body: bodyC, tail: { canvas: crop(tailFull, tbox), box: tbox }, effects, size: [W, H] };
}

export async function cutPanels() {
  const sheet = new Image();
  sheet.src = SHEET;
  await sheet.decode();
  const out = {};
  for (const [mood, cfg] of Object.entries(PANELS)) out[mood] = { ...cutPanel(sheet, cfg), cfg };
  return out;
}
