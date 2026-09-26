'use strict';
const $ = s => document.querySelector(s);
const cv = $('#scene'), cx = cv.getContext('2d');
const gr = $('#graph'), gx = gr.getContext('2d');

/* ---------- Estado ---------- */
const P = { m: 5, h: 100, v0: 0, g: 9.81, mu: 0, ts: 1 };
const S = { x: 0, vs: 0, E: 0, E0: 1, t: 0, run: false, rot: 0,
            broken: false, bt: 0, shake: 0, pieces: null, bx: 0, by: 0, bvx: 0, bvy: 0 };
// Perfil normalizado de la pista: [posición 0..1, altura 0..1]
const PROF = [[0,1],[.12,1],[.32,0],[.5,.6],[.68,0],[.84,.3],[1,0]];
const START_U = .13;
let L = 300, Hk = 1, trail = [], hist = [], last = 0, prevM = P.m, GW = 1, GH = 1;
const MAXH = 500, view = { sc: 1, ox: 0, base: 0, W: 1, H: 1 };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Pista ---------- */
function fn(u) {
  let i = 0;
  while (i < PROF.length - 2 && u > PROF[i + 1][0]) i++;
  const [u0, f0] = PROF[i], [u1, f1] = PROF[i + 1];
  const t = Math.min(1, Math.max(0, (u - u0) / (u1 - u0)));
  return [f0 + (f1 - f0) * (1 - Math.cos(Math.PI * t)) / 2,
          (f1 - f0) * Math.PI / 2 * Math.sin(Math.PI * t) / (u1 - u0)];
}
function trk(x) { const [f, d] = fn(Math.min(1, Math.max(0, x / L))); return [Hk * f, Hk * d / L]; } // [altura, pendiente]
const R = () => Math.min(34, 9 + (Math.log10(Math.max(P.m, .1)) + 1) * 3.5);

/* ---------- Física ---------- */
function reset() {
  S.broken = false; S.pieces = null; $('#broken').hidden = true;
  L = 3 * Math.max(P.h, 2);
  Hk = P.h / fn(START_U)[0];
  S.x = L * START_U;
  const y = trk(S.x)[0];
  S.vs = P.v0;
  S.E = P.m * (P.g * y + .5 * P.v0 * P.v0);
  S.E0 = Math.max(S.E, 1e-9);
  S.t = 0; S.run = false; S.rot = 0; trail = []; hist = [];
  $('#play').textContent = 'Soltar esfera';
}
function step(h) {
  const [, dy] = trk(S.x), n = Math.hypot(1, dy), sin = dy / n, cos = 1 / n;
  const sg = Math.sign(S.vs), fr = P.mu * P.g * cos;
  let a = -P.g * sin;
  if (sg) a -= fr * sg; else a = Math.abs(a) <= fr ? 0 : a - fr * Math.sign(a);
  let v = S.vs + a * h;
  if (sg && Math.sign(v) !== sg && Math.abs(P.g * sin) <= fr) v = 0; // la fricción la detiene
  S.x += v * cos * h;
  if (S.x < 0) { S.x = 0; v = Math.abs(v); }
  if (S.x > L) { S.x = L; v = -Math.abs(v); }
  S.E -= P.m * fr * Math.abs(v) * h;            // trabajo de la fricción (se vuelve calor)
  const y = trk(S.x)[0];
  if (v === 0) { S.vs = 0; S.E = Math.min(S.E, P.m * P.g * y) || 0; if (P.mu > 0) S.E = P.m * P.g * y; }
  else S.vs = Math.sign(v) * Math.sqrt(Math.max(0, 2 * (S.E / P.m - P.g * y)));
}
function advance(dt) {
  const n = Math.ceil(dt / .01), h = dt / n;
  for (let i = 0; i < n; i++) step(h);
  S.rot += S.vs * dt * view.sc / R();
  S.t += dt;
}
const energies = () => { const y = trk(S.x)[0]; return { y, pe: P.m * P.g * y, ke: .5 * P.m * S.vs * S.vs }; };

/* ---------- Controles ---------- */
const CTL = {
  m:  { min: .1, max: Infinity, fromR: p => .1 * Math.pow(1e4, p / 1000), toR: m => Math.min(1000, 1000 * Math.log10(m / .1) / 4) },
  h:  { min: 0, max: 1000 }, v0: { min: 0, max: 300 },
  mu: { min: 0, max: .5 },   ts: { min: .1, max: 10 }
};
function changed(k) {
  if (k === 'm') massLogic(); else if (k === 'h' || k === 'v0') reset();
}
Object.entries(CTL).forEach(([k, c]) => {
  const r = $('#r-' + k), n = $('#n-' + k);
  const fromR = c.fromR || (p => +p), toR = c.toR || (v => v);
  const show = v => { n.value = +v.toPrecision(3); };
  r.value = toR(P[k]); show(P[k]);
  r.addEventListener('input', () => { prevM = P[k]; P[k] = fromR(+r.value); if (k === 'm') P.m = Math.max(.1, P.m); show(P[k]); changed(k); });
  n.addEventListener('input', () => {
    let v = parseFloat(n.value); if (isNaN(v)) return;
    v = Math.min(c.max, Math.max(c.min, v));
    prevM = P[k]; P[k] = v; r.value = toR(v); changed(k);
  });
});
$('#s-g').addEventListener('change', e => { P.g = +e.target.value; reset(); });
$('#play').addEventListener('click', () => {
  if (S.broken) return;
  S.run = !S.run;
  $('#play').textContent = S.run ? 'Pausar' : 'Continuar';
});
$('#reset').addEventListener('click', () => { if (P.m > 1000) return; reset(); });
$('#rebuild').addEventListener('click', () => {
  P.m = 5; prevM = 5; $('#n-m').value = 5; $('#r-m').value = CTL.m.toR(5); massLogic(true);
});

function massLogic(force) {
  const note = $('#massnote');
  if (P.m > 1000) { if (!S.broken) breakIt(); return; }
  if (S.broken || force) { reset(); }
  else if (prevM > 0) { S.E *= P.m / prevM; S.E0 *= P.m / prevM; }
  const close = P.m >= 900;
  note.textContent = close ? '⚠ La estructura cruje… no la fuerces más.' : 'Rango: 0.1 – 1000 kg';
  note.classList.toggle('warn', close);
}
function breakIt() {
  S.broken = true; S.bt = 0; S.run = false; S.shake = .5; S.pieces = null;
  $('#massnote').textContent = '💥 Superaste el límite estructural.';
  $('#massnote').classList.add('warn');
  $('#play').textContent = 'Soltar esfera';
}

/* Colocar la esfera con el dedo o el ratón */
function place(e) {
  if (S.broken) return;
  const r = cv.getBoundingClientRect();
  S.x = Math.min(L, Math.max(0, (e.clientX - r.left - view.ox) / view.sc));
  S.vs = 0; S.E = P.m * P.g * trk(S.x)[0]; S.E0 = Math.max(S.E, 1e-9); hist = []; trail = [];
}
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); place(e); });
cv.addEventListener('pointermove', e => { if (e.buttons) place(e); });

/* ---------- Dibujo ---------- */
function layout() {
  const d = devicePixelRatio || 1;
  for (const [c, ctx] of [[cv, cx], [gr, gx]]) {
    const b = c.getBoundingClientRect();
    c.width = b.width * d; c.height = b.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  const b = cv.getBoundingClientRect(); view.W = b.width; view.H = b.height;
  GW = gr.getBoundingClientRect().width; GH = gr.getBoundingClientRect().height;
}
addEventListener('resize', layout);
const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
const mix = c => `rgb(${224 + (14 - 224) * c | 0},${146 + (138 - 146) * c | 0},${26 + (140 - 26) * c | 0})`;
function fmtE(j) { return j >= 1e6 ? (j / 1e6).toFixed(2) + ' MJ' : j >= 1e3 ? (j / 1e3).toFixed(2) + ' kJ' : j.toFixed(1) + ' J'; }

function drawBall(px, py, r, rot, c) {
  const g = cx.createRadialGradient(px - r * .35, py - r * .35, r * .1, px, py, r);
  g.addColorStop(0, '#fff'); g.addColorStop(.25, mix(c)); g.addColorStop(1, '#14213A');
  cx.fillStyle = g; cx.beginPath(); cx.arc(px, py, r, 0, 7); cx.fill();
  cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 2; cx.beginPath();
  cx.moveTo(px + Math.cos(rot) * r * .9, py + Math.sin(rot) * r * .9);
  cx.lineTo(px - Math.cos(rot) * r * .9, py - Math.sin(rot) * r * .9); cx.stroke();
}
function arrow(x, y, dx, dy, col) {
  cx.strokeStyle = cx.fillStyle = col; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + dx, y + dy); cx.stroke();
  const a = Math.atan2(dy, dx); cx.beginPath(); cx.moveTo(x + dx, y + dy);
  cx.lineTo(x + dx - 10 * Math.cos(a - .5), y + dy - 10 * Math.sin(a - .5));
  cx.lineTo(x + dx - 10 * Math.cos(a + .5), y + dy - 10 * Math.sin(a + .5)); cx.fill();
}

function render(dt) {
  const { W, H } = view; cx.clearRect(0, 0, W, H);
  const pl = 58, pr = 18, pt = 24, pb = 34, ymax = Math.max(P.h, 1);
  const sc = Math.min((W - pl - pr) / L, (H - pt - pb) / (ymax * 1.08));
  const ox = pl + (W - pl - pr - L * sc) / 2, base = H - pb;
  Object.assign(view, { sc, ox, base });
  const X = x => ox + x * sc, Y = y => base - y * sc;
  cx.save();
  if (S.shake > 0) { if (!reduce) cx.translate((Math.random() - .5) * S.shake * 16, (Math.random() - .5) * S.shake * 16); S.shake = Math.max(0, S.shake - dt * 1.1); }
  cx.font = '600 12px "Bricolage Grotesque",sans-serif'; cx.textAlign = 'right'; cx.textBaseline = 'middle';

  // regla de alturas
  const st = nice(ymax / 4);
  for (let y = 0; y <= ymax * 1.05; y += st) {
    cx.strokeStyle = 'rgba(20,33,58,.14)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(pl - 4, Y(y)); cx.lineTo(W - pr, Y(y)); cx.stroke();
    cx.fillStyle = '#5B6578'; cx.fillText(y + ' m', pl - 10, Y(y));
  }
  const pts = []; for (let i = 0; i <= 90; i++) { const x = L * i / 90; pts.push([X(x), Y(trk(x)[0])]); }

  if (!S.broken || S.bt < .8) {
    const jit = S.broken ? () => (Math.random() - .5) * 5 : () => 0;
    cx.fillStyle = 'rgba(20,33,58,.07)'; cx.beginPath(); cx.moveTo(pts[0][0], base);
    pts.forEach(p => cx.lineTo(p[0], p[1])); cx.lineTo(pts[90][0], base); cx.fill();
    cx.strokeStyle = 'rgba(20,33,58,.35)'; cx.lineWidth = 1.5;
    for (let i = 3; i < 90; i += 6) { cx.beginPath(); cx.moveTo(pts[i][0], pts[i][1]); cx.lineTo(pts[i][0], base); cx.stroke(); }
    cx.strokeStyle = '#14213A'; cx.lineWidth = 5; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.beginPath();
    pts.forEach((p, i) => i ? cx.lineTo(p[0] + jit(), p[1] + jit()) : cx.moveTo(p[0], p[1])); cx.stroke();
    if (S.broken) { cx.strokeStyle = '#C8352B'; cx.lineWidth = 2; for (let i = 5; i < 90; i += 9) { cx.beginPath(); cx.moveTo(pts[i][0] - 5, pts[i][1] - 6); cx.lineTo(pts[i][0] + 2, pts[i][1]); cx.lineTo(pts[i][0] - 3, pts[i][1] + 7); cx.stroke(); } }
  }
  cx.strokeStyle = '#14213A'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(pl - 4, base); cx.lineTo(W - pr, base); cx.stroke();

  const r = R();
  if (!S.broken) {
    const { y, pe, ke } = energies(), dy = trk(S.x)[1], n = Math.hypot(1, dy);
    const bx = X(S.x) - dy / n * r, by = Y(y) - 1 / n * r, c = pe + ke > 0 ? ke / (pe + ke) : 0;
    trail.push([S.x, c]); if (trail.length > 70) trail.shift();
    trail.forEach(([x, cc], i) => { cx.fillStyle = mix(cc); cx.globalAlpha = i / 110; cx.beginPath(); cx.arc(X(x), Y(trk(x)[0]), 3, 0, 7); cx.fill(); });
    cx.globalAlpha = 1;
    // guía de altura
    cx.strokeStyle = '#E0921A'; cx.lineWidth = 1.5; cx.setLineDash([5, 4]); cx.beginPath(); cx.moveTo(bx, by + r); cx.lineTo(bx, base); cx.stroke(); cx.setLineDash([]);
    if (y * sc > 26) { cx.fillStyle = '#B06F0C'; cx.textAlign = 'left'; cx.fillText('h = ' + y.toFixed(1) + ' m', bx + 6, (by + base) / 2); cx.textAlign = 'right'; }
    drawBall(bx, by, r, S.rot, c);
    if (Math.abs(S.vs) > .05) { const sg = Math.sign(S.vs), len = Math.min(110, 14 + Math.abs(S.vs) * 1.2); arrow(bx, by - r - 8 + 0, sg * len / n, -sg * len * dy / n, '#0E8A8C'); }
    S.bx = bx; S.by = by;
  } else {
    if (S.bt >= .8 && !S.pieces) {
      S.pieces = []; S.shake = 1; S.bvy = -260; S.bvx = 60;
      const mk = (a, b, w) => S.pieces.push({ cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, hx: (b[0] - a[0]) / 2, hy: (b[1] - a[1]) / 2, w,
        vx: (Math.random() - .5) * 220, vy: -Math.random() * 320, rot: 0, rv: (Math.random() - .5) * 6 });
      for (let i = 0; i < 90; i += 2) mk(pts[i], pts[i + 1], 5);
      for (let i = 3; i < 90; i += 6) mk(pts[i], [pts[i][0], base], 1.5);
    }
    if (S.bt < .8) drawBall(S.bx + (Math.random() - .5) * 3, S.by, r, S.rot, .5);
    if (S.pieces) {
      cx.lineCap = 'round'; cx.strokeStyle = '#14213A';
      S.pieces.forEach(p => {
        p.vy += 1500 * dt; p.cx += p.vx * dt; p.cy += p.vy * dt; p.rot += p.rv * dt;
        cx.save(); cx.translate(p.cx, p.cy); cx.rotate(p.rot); cx.lineWidth = p.w;
        cx.beginPath(); cx.moveTo(-p.hx, -p.hy); cx.lineTo(p.hx, p.hy); cx.stroke(); cx.restore();
      });
      S.bvy += 1500 * dt; S.by += S.bvy * dt; S.bx += S.bvx * dt; S.rot += 8 * dt;
      drawBall(S.bx, S.by, r, S.rot, 1);
    }
    S.bt += dt;
    if (S.bt > 2.2) $('#broken').hidden = false;
  }
  cx.restore();
}

function drawGraph() {
  gx.clearRect(0, 0, GW, GH);
  const ref = S.E0 * 1.05, sx = GW / MAXH;
  const line = (key, col, dash) => {
    gx.strokeStyle = col; gx.lineWidth = 2; gx.setLineDash(dash || []); gx.beginPath();
    hist.forEach((s, i) => { const v = key === 'et' ? s.pe + s.ke : s[key], px = i * sx, py = GH - 4 - Math.min(1, v / ref) * (GH - 8); i ? gx.lineTo(px, py) : gx.moveTo(px, py); });
    gx.stroke(); gx.setLineDash([]);
  };
  line('pe', '#E0921A'); line('ke', '#0E8A8C'); line('et', '#14213A', [5, 4]);
}

function updateReadout() {
  const { y, pe, ke } = energies(), et = pe + ke, v = Math.abs(S.vs);
  $('#o-h').textContent = y.toFixed(1) + ' m';
  $('#o-v').textContent = v.toFixed(1) + ' m/s (' + (v * 3.6).toFixed(0) + ' km/h)';
  $('#o-ep').textContent = fmtE(pe); $('#o-ec').textContent = fmtE(ke); $('#o-et').textContent = fmtE(et);
  const w = e => Math.min(100, e / S.E0 * 100) + '%';
  $('#b-ep').style.width = w(pe); $('#b-ec').style.width = w(ke); $('#b-et').style.width = w(et);
  let t;
  if (S.broken) t = 'La estructura colapsó.';
  else if (v < .05 && et > 0) t = 'La esfera está en reposo: toda su energía es potencial.';
  else if (ke / et > .9) t = 'Abajo: casi toda la energía es cinética, por eso va más rápido.';
  else if (pe / et > .9) t = 'Arriba: casi toda la energía es potencial, por eso va lento.';
  else t = 'La energía se transforma: lo que pierde una, lo gana la otra.';
  if (P.mu > 0 && !S.broken) t += ' La fricción convierte parte en calor y el total baja.';
  $('#caption').textContent = t;
}

/* ---------- Bucle principal ---------- */
function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  if (S.run && !S.broken) {
    advance(dt * P.ts);
    const { pe, ke } = energies(); hist.push({ pe, ke }); if (hist.length > MAXH) hist.shift();
  }
  render(dt); if (!S.broken) { updateReadout(); drawGraph(); }
  requestAnimationFrame(frame);
}
layout(); reset(); massLogic(true);
requestAnimationFrame(frame);
