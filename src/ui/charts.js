import Chart from "chart.js/auto";
import { shortFloat, shortHz } from "./format.js";

const chartsByCanvas = new WeakMap();

const noDataPlugin = {
  id: "noDataLabel",
  afterDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.fillStyle = "#4a5a68";
    ctx.font = "13px 'JetBrains Mono', Menlo, Consolas, monospace";
    ctx.fillText("No data", chartArea.left + 8, chartArea.top + 18);
    ctx.restore();
  },
};
Chart.register(noDataPlugin);

function toPoints(xVals, yVals, xLog) {
  if (!Array.isArray(xVals) || !Array.isArray(yVals)) return [];
  const n = Math.min(xVals.length, yVals.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = Number(xVals[i]);
    const y = Number(yVals[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (xLog && x <= 0) continue;
    out.push({ x, y });
  }
  return out;
}

function paddedYBounds(primaryPoints, secondaryPoints) {
  const values = [];
  for (const pt of primaryPoints) values.push(pt.y);
  for (const pt of secondaryPoints) values.push(pt.y);

  let yMin = values.length ? Math.min(...values) : -1;
  let yMax = values.length ? Math.max(...values) : 1;
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return { min: -1, max: 1 };
  }
  if (Math.abs(yMax - yMin) < 1e-15) {
    const bump = Math.max(Math.abs(yMax) * 0.05, 1e-6);
    yMin -= bump;
    yMax += bump;
  }
  const yPad = 0.08 * (yMax - yMin);
  return { min: yMin - yPad, max: yMax + yPad };
}

function xBounds(points) {
  if (!points.length) return null;
  let min = points[0].x;
  let max = points[0].x;
  for (let i = 1; i < points.length; i++) {
    const x = points[i].x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { min, max };
}

export function drawChart(canvas, xVals, yVals, cfg) {
  if (!canvas) return;

  const primaryPoints = toPoints(xVals, yVals, Boolean(cfg.xLog));
  const secondaryPoints = Array.isArray(cfg.secondaryY)
    ? toPoints(xVals, cfg.secondaryY, Boolean(cfg.xLog))
    : [];
  const bounds = paddedYBounds(primaryPoints, secondaryPoints);
  const combinedX = xBounds([...primaryPoints, ...secondaryPoints]);

  const datasets = [
    {
      label: cfg.lineLabel || "primary",
      data: primaryPoints,
      borderColor: cfg.lineColor || "#00e68a",
      backgroundColor: cfg.lineColor || "#00e68a",
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      spanGaps: true,
    },
  ];

  if (secondaryPoints.length || Array.isArray(cfg.secondaryY)) {
    datasets.push({
      label: cfg.secondaryLabel || "secondary",
      data: secondaryPoints,
      borderColor: cfg.secondaryColor || "#ffb347",
      backgroundColor: cfg.secondaryColor || "#ffb347",
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      spanGaps: true,
    });
  }

  const hasNamedLegend = Boolean(cfg.lineLabel || cfg.secondaryLabel);
  const chartConfig = {
    type: "line",
    data: { datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      plugins: {
        legend: {
          display: hasNamedLegend,
          labels: {
            color: "#6b7f8e",
            boxWidth: 12,
            boxHeight: 2,
            font: {
              family: "'JetBrains Mono', Menlo, Consolas, monospace",
              size: 11,
            },
          },
        },
        tooltip: {
          callbacks: {
            title(items) {
              const x = items?.[0]?.parsed?.x;
              if (!Number.isFinite(x)) return "";
              return cfg.xLog ? shortHz(x) : shortFloat(x);
            },
            label(item) {
              const value = item?.parsed?.y;
              if (!Number.isFinite(value)) return "";
              return `${item.dataset.label}: ${shortFloat(value)}`;
            },
          },
        },
        noDataLabel: {
          enabled: primaryPoints.length === 0 && secondaryPoints.length === 0,
        },
      },
      scales: {
        x: {
          type: cfg.xLog ? "logarithmic" : "linear",
          min: combinedX?.min,
          max: combinedX?.max,
          title: {
            display: true,
            text: cfg.titleX || "",
            color: "#5a6e7e",
            font: {
              family: "'DM Sans', system-ui, sans-serif",
              size: 11,
            },
          },
          ticks: {
            color: "#4a5a68",
            maxTicksLimit: cfg.xLog ? 7 : 6,
            callback(value) {
              const v = Number(value);
              return cfg.xLog ? shortHz(v) : shortFloat(v);
            },
            font: {
              family: "'JetBrains Mono', Menlo, Consolas, monospace",
              size: 11,
            },
          },
          border: {
            color: "#243040",
          },
          grid: {
            color: "#1a2430",
          },
        },
        y: {
          type: "linear",
          min: bounds.min,
          max: bounds.max,
          title: {
            display: true,
            text: cfg.titleY || "",
            color: "#5a6e7e",
            font: {
              family: "'DM Sans', system-ui, sans-serif",
              size: 11,
            },
          },
          ticks: {
            color: "#4a5a68",
            callback(value) {
              return shortFloat(Number(value));
            },
            font: {
              family: "'JetBrains Mono', Menlo, Consolas, monospace",
              size: 11,
            },
          },
          border: {
            color: "#243040",
          },
          grid: {
            color: "#1a2430",
          },
        },
      },
    },
  };

  const existing = chartsByCanvas.get(canvas);
  if (existing) {
    existing.config.data = chartConfig.data;
    existing.config.options = chartConfig.options;
    existing.update("none");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const chart = new Chart(ctx, chartConfig);
  chartsByCanvas.set(canvas, chart);
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
