export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function toNum(v, fallback) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function toPos(v, fallback) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : fallback;
}

export function shortFloat(v) {
  const a = Math.abs(v);
  if (a >= 1e4 || (a > 0 && a < 1e-3)) return v.toExponential(2);
  return v
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.[0-9]*?)0+$/, '$1');
}

export function shortHz(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return shortFloat(v);
}

export function fmtCap(f) {
  const a = Math.abs(f);
  if (a >= 1e-6) return `${shortFloat(f * 1e6)} µF`;
  if (a >= 1e-9) return `${shortFloat(f * 1e9)} nF`;
  return `${shortFloat(f * 1e12)} pF`;
}

export function fmtCharge(c) {
  const a = Math.abs(c);
  if (a >= 1e-6) return `${shortFloat(c * 1e6)} µC`;
  if (a >= 1e-9) return `${shortFloat(c * 1e9)} nC`;
  if (a >= 1e-12) return `${shortFloat(c * 1e12)} pC`;
  return `${shortFloat(c)} C`;
}

export function fmtVolt(v) {
  const a = Math.abs(v);
  if (a >= 1) return `${shortFloat(v)} V`;
  if (a >= 1e-3) return `${shortFloat(v * 1e3)} mV`;
  return `${shortFloat(v * 1e6)} µV`;
}

export function fmtHz(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(3)} MHz`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(3)} kHz`;
  return `${shortFloat(v)} Hz`;
}

export function fmtSec(v) {
  const a = Math.abs(v);
  if (a >= 1) return `${shortFloat(v)} s`;
  if (a >= 1e-3) return `${shortFloat(v * 1e3)} ms`;
  if (a >= 1e-6) return `${shortFloat(v * 1e6)} µs`;
  return `${shortFloat(v * 1e9)} ns`;
}

export function fmtOhm(v) {
  if (v >= 1e6) return `${shortFloat(v / 1e6)} MΩ`;
  if (v >= 1e3) return `${shortFloat(v / 1e3)} kΩ`;
  return `${shortFloat(v)} Ω`;
}

export function fmtCurrent(v) {
  const a = Math.abs(v);
  if (a >= 1e-3) return `${shortFloat(v * 1e3)} mA`;
  if (a >= 1e-6) return `${shortFloat(v * 1e6)} µA`;
  if (a >= 1e-9) return `${shortFloat(v * 1e9)} nA`;
  if (a >= 1e-12) return `${shortFloat(v * 1e12)} pA`;
  return `${shortFloat(v)} A`;
}

export function pctDelta(calc, ref) {
  if (!Number.isFinite(calc) || !Number.isFinite(ref) || ref === 0)
    return 'n/a';
  const d = ((calc - ref) / ref) * 100;
  const s = d >= 0 ? '+' : '';
  return `${s}${d.toFixed(2)}%`;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
