import { shortFloat, shortHz } from "./format.js";

export function drawChart(canvas, xVals, yVals, cfg) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;
  ctx.clearRect(0, 0, w, h);

  if (!Array.isArray(xVals) || !Array.isArray(yVals) || xVals.length === 0 || yVals.length === 0) {
    ctx.fillStyle = "#6d7a86";
    ctx.font = "13px Menlo, Consolas, monospace";
    ctx.fillText("No data", 14, 24);
    return;
  }

  const padL = 72;
  const padR = 16;
  const padT = 12;
  const padB = 38;

  const plotW = Math.max(20, w - padL - padR);
  const plotH = Math.max(20, h - padT - padB);

  const ySeries = [yVals];
  if (Array.isArray(cfg.secondaryY)) ySeries.push(cfg.secondaryY);
  const finiteY = ySeries.flat().filter(Number.isFinite);
  let yMin = finiteY.length ? Math.min(...finiteY) : -1;
  let yMax = finiteY.length ? Math.max(...finiteY) : 1;
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = -1;
    yMax = 1;
  }
  if (Math.abs(yMax - yMin) < 1e-15) {
    const bump = Math.max(Math.abs(yMax) * 0.05, 1e-6);
    yMin -= bump;
    yMax += bump;
  }
  const yPad = 0.08 * (yMax - yMin);
  yMin -= yPad;
  yMax += yPad;

  let xMin = Math.min(...xVals);
  let xMax = Math.max(...xVals);
  if (cfg.xLog) {
    xMin = Math.max(xMin, 1e-12);
    xMax = Math.max(xMax, xMin * 1.0001);
  } else if (Math.abs(xMax - xMin) < 1e-15) {
    xMax = xMin + 1;
  }

  const xToPx = (x) => {
    if (cfg.xLog) {
      const lx = Math.log10(Math.max(x, xMin));
      const lmin = Math.log10(xMin);
      const lmax = Math.log10(xMax);
      return padL + ((lx - lmin) / (lmax - lmin)) * plotW;
    }
    return padL + ((x - xMin) / (xMax - xMin)) * plotW;
  };

  const yToPx = (y) => padT + ((yMax - y) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "#deceb7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.stroke();

  ctx.font = "11px Menlo, Consolas, monospace";
  ctx.fillStyle = "#5f7280";

  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = yMin + (i / yTicks) * (yMax - yMin);
    const py = yToPx(y);
    ctx.strokeStyle = "#efe2cf";
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(padL + plotW, py);
    ctx.stroke();
    ctx.fillText(shortFloat(y), 4, py + 4);
  }

  const xTicks = cfg.xLog ? buildLogTicks(xMin, xMax) : buildLinearTicks(xMin, xMax, 6);
  for (const x of xTicks) {
    const px = xToPx(x);
    ctx.strokeStyle = "#f1e6d6";
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, padT + plotH);
    ctx.stroke();
    ctx.fillStyle = "#5f7280";
    ctx.fillText(cfg.xLog ? shortHz(x) : shortFloat(x), px - 16, padT + plotH + 16);
  }

  ctx.strokeStyle = cfg.lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let moved = false;
  for (let i = 0; i < xVals.length; i++) {
    const x = xVals[i];
    const y = yVals[i];
    if (!Number.isFinite(y)) continue;
    const px = xToPx(x);
    const py = yToPx(y);
    if (!moved) {
      ctx.moveTo(px, py);
      moved = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  if (Array.isArray(cfg.secondaryY)) {
    ctx.strokeStyle = cfg.secondaryColor || "#cc6f4d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    moved = false;
    const n = Math.min(xVals.length, cfg.secondaryY.length);
    for (let i = 0; i < n; i++) {
      const y = cfg.secondaryY[i];
      if (!Number.isFinite(y)) continue;
      const px = xToPx(xVals[i]);
      const py = yToPx(y);
      if (!moved) {
        ctx.moveTo(px, py);
        moved = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#34495b";
  ctx.font = "12px Menlo, Consolas, monospace";
  ctx.fillText(cfg.titleX, padL + plotW / 2 - 44, h - 8);

  ctx.save();
  ctx.translate(14, padT + plotH / 2 + 30);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(cfg.titleY, 0, 0);
  ctx.restore();

  if (cfg.lineLabel || cfg.secondaryLabel) {
    const legendY = padT + 12;
    let legendX = padL + plotW - 130;
    if (cfg.lineLabel) {
      ctx.fillStyle = cfg.lineColor;
      ctx.fillRect(legendX, legendY - 8, 10, 3);
      ctx.fillStyle = "#445b68";
      ctx.fillText(cfg.lineLabel, legendX + 14, legendY);
      legendX += 56;
    }
    if (cfg.secondaryLabel) {
      ctx.fillStyle = cfg.secondaryColor || "#cc6f4d";
      ctx.fillRect(legendX, legendY - 8, 10, 3);
      ctx.fillStyle = "#445b68";
      ctx.fillText(cfg.secondaryLabel, legendX + 14, legendY);
    }
  }
}

function buildLinearTicks(min, max, target) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min, max];
  const ticks = [];
  for (let i = 0; i <= target; i++) {
    ticks.push(min + (i / target) * (max - min));
  }
  return ticks;
}

function buildLogTicks(min, max) {
  const ticks = [];
  const p0 = Math.floor(Math.log10(min));
  const p1 = Math.ceil(Math.log10(max));
  for (let p = p0; p <= p1; p++) {
    const v = 10 ** p;
    if (v >= min && v <= max) ticks.push(v);
  }
  if (!ticks.includes(min)) ticks.unshift(min);
  if (!ticks.includes(max)) ticks.push(max);
  return ticks;
}

export function logSpace(min, max, points) {
  const out = [];
  const lmin = Math.log(min);
  const lmax = Math.log(max);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    out.push(Math.exp(lmin + t * (lmax - lmin)));
  }
  return out;
}
