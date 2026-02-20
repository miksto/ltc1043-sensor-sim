import {
  simulate as coreSimulate,
  simulateWithState as coreSimulateWithState,
} from "./simulator-core.mjs";
import {
  DEFAULTS,
  INPUT_IDS,
  POSITION_SWEEP_CENTER_TRAVEL_FRACTION,
  REF,
  SOLVER,
} from "./ui/constants.js";
import {
  clamp,
  shortFloat,
  toNum,
  toPos,
} from "./ui/format.js";
import { drawChart } from "./ui/charts.js";
import {
  buildSolverResidualData,
  buildSolverTraceData,
  sweepFrequency,
  sweepGap,
  sweepPosition,
} from "./ui/sweeps.js";
import { renderMetrics, renderValidation } from "./ui/rendering.js";

const el = {};
for (const id of INPUT_IDS) {
  el[id] = document.getElementById(id);
}

const metricsEl = document.getElementById("metrics");
const warningsEl = document.getElementById("warnings");
const validationRowsEl = document.getElementById("validationRows");

const canvases = {
  freq: document.getElementById("chartFreq"),
  pos: document.getElementById("chartPos"),
  gap: document.getElementById("chartGap"),
  solverTrace: document.getElementById("chartSolverTrace"),
  solverResidual: document.getElementById("chartSolverResidual"),
};

function setDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!el[key]) continue;
    el[key].value = String(value);
  }
  syncPositionDisplays();
  updatePlateAreaInfo();
}

function readInputs() {
  const inputs = {
    widthCm: toPos(el.widthCm.value, DEFAULTS.widthCm),
    heightCm: toPos(el.heightCm.value, DEFAULTS.heightCm),
    totalGapMm: toPos(el.totalGapMm.value, DEFAULTS.totalGapMm),
    position: clamp(toNum(el.position.value, DEFAULTS.position), 0, 1),
    freqHz: toPos(el.freqHz.value, DEFAULTS.freqHz),
    vDrivePeakV: toPos(el.vDrivePeakV.value, DEFAULTS.vDrivePeakV),
    r10Ohm: toPos(el.r10Ohm.value, DEFAULTS.r10Ohm),
    r11Ohm: toPos(el.r11Ohm.value, DEFAULTS.r11Ohm),
    iBiasA: toNum(el.iBiasPA.value, DEFAULTS.iBiasPA) * 1e-12,
    c3F: toPos(el.c3F.value, DEFAULTS.c3F) * 1e-12,
    c4F: toPos(el.c4F.value, DEFAULTS.c4F) * 1e-12,
    ccF: Math.max(0, toNum(el.ccF.value, DEFAULTS.ccF)) * 1e-12,
    epsilonR: DEFAULTS.epsilonR,
    minGapMm: toPos(el.minGapMm.value, DEFAULTS.minGapMm),
  };

  const sweep = {
    freqMinHz: toPos(el.freqMinHz.value, DEFAULTS.freqMinHz),
    freqMaxHz: toPos(el.freqMaxHz.value, DEFAULTS.freqMaxHz),
    freqPoints: Math.round(toPos(el.freqPoints.value, DEFAULTS.freqPoints)),
    gapMinMm: toPos(el.gapMinMm.value, DEFAULTS.gapMinMm),
    gapMaxMm: toPos(el.gapMaxMm.value, DEFAULTS.gapMaxMm),
    gapPoints: Math.round(toPos(el.gapPoints.value, DEFAULTS.gapPoints)),
    positionPoints: Math.round(toPos(el.positionPoints.value, DEFAULTS.positionPoints)),
  };

  if (sweep.freqMaxHz <= sweep.freqMinHz) {
    sweep.freqMaxHz = sweep.freqMinHz * 1.1;
  }
  if (sweep.gapMaxMm <= sweep.gapMinMm) {
    sweep.gapMaxMm = sweep.gapMinMm * 1.1;
  }

  return { inputs, sweep };
}

function simulateWithState(input, initialState, solverOverride = null) {
  return coreSimulateWithState(input, initialState, solverOverride || SOLVER);
}

function simulate(input) {
  return coreSimulate(input, SOLVER);
}

function run() {
  const { inputs, sweep } = readInputs();
  syncPositionDisplays();
  updatePlateAreaInfo();

  const op = simulateWithState(inputs, null, { ...SOLVER, collectTrace: true });
  const res = op.result;

  renderMetrics(metricsEl, warningsEl, res);
  renderValidation(validationRowsEl, simulate, inputs, REF);

  const freqData = sweepFrequency(inputs, sweep, op.state, simulateWithState);
  const posData = sweepPosition(
    inputs,
    sweep,
    op.state,
    simulateWithState,
    POSITION_SWEEP_CENTER_TRAVEL_FRACTION,
  );
  const gapData = sweepGap(inputs, sweep, op.state, simulateWithState);

  drawChart(canvases.freq, freqData.x, freqData.y, {
    titleX: "Frequency (Hz)",
    titleY: "Vout (V)",
    lineColor: "#00e68a",
    xLog: true,
  });

  drawChart(canvases.pos, posData.x, posData.y, {
    titleX: "Position fraction",
    titleY: "Vout (V)",
    lineColor: "#ffb347",
    xLog: false,
  });

  drawChart(canvases.gap, gapData.x, gapData.y, {
    titleX: "Total separation G (mm)",
    titleY: "Vout (V)",
    lineColor: "#5cc9f5",
    xLog: false,
  });

  const solverTraceData = buildSolverTraceData(op.trace || []);
  drawChart(canvases.solverTrace, solverTraceData.x, solverTraceData.v3, {
    titleX: "Iteration",
    titleY: "Voltage (V)",
    lineColor: "#a78bfa",
    xLog: false,
    lineLabel: "V3",
    secondaryY: solverTraceData.vOut,
    secondaryColor: "#ffb347",
    secondaryLabel: "Vout",
  });

  const residualScale = el.residualScale?.value === "log" ? "log" : "linear";
  const residualData = buildSolverResidualData(op.trace || [], residualScale);
  drawChart(canvases.solverResidual, residualData.x, residualData.y, {
    titleX: "Iteration",
    titleY: residualData.yLabel,
    lineColor: "#5cc9f5",
    xLog: false,
    lineLabel: residualData.lineLabel,
  });
}

function updatePlateAreaInfo() {
  const widthCm = toPos(el.widthCm.value, DEFAULTS.widthCm);
  const heightCm = toPos(el.heightCm.value, DEFAULTS.heightCm);
  const areaCm2 = widthCm * heightCm;
  if (el.plateAreaInfo) {
    el.plateAreaInfo.value = shortFloat(areaCm2);
  }
}

function totalGapMmFromInput() {
  return toPos(el.totalGapMm.value, DEFAULTS.totalGapMm);
}

function positionToOffsetMm(position) {
  return (position - 0.5) * totalGapMmFromInput();
}

function offsetMmToPosition(offsetMm) {
  const totalGapMm = totalGapMmFromInput();
  if (totalGapMm <= 0) return 0.5;
  return clamp(0.5 + (offsetMm / totalGapMm), 0, 1);
}

function syncPositionDisplays() {
  const p = clamp(toNum(el.position.value, DEFAULTS.position), 0, 1);
  if (el.positionText) {
    el.positionText.value = p.toFixed(3);
  }
  if (el.positionOffsetMm) {
    el.positionOffsetMm.value = shortFloat(positionToOffsetMm(p));
  }
}

function syncSliderFromOffsetInput() {
  const raw = Number(el.positionOffsetMm.value);
  if (!Number.isFinite(raw)) return;
  const p = offsetMmToPosition(raw);
  el.position.value = String(p);
  syncPositionDisplays();
}

function bindEvents() {
  const list = Object.entries(el).filter(([, node]) => Boolean(node));
  for (const [id, node] of list) {
    if (id === "positionText" || id === "plateAreaInfo") continue;

    node.addEventListener("input", () => {
      if (id === "position") {
        syncPositionDisplays();
      } else if (id === "positionOffsetMm") {
        syncSliderFromOffsetInput();
      } else if (id === "totalGapMm") {
        syncPositionDisplays();
      }
      run();
    });

    if (node.type !== "range") {
      node.addEventListener("change", () => {
        if (id === "positionOffsetMm") {
          syncSliderFromOffsetInput();
        } else if (id === "totalGapMm") {
          syncPositionDisplays();
        }
        run();
      });
    }
  }

  window.addEventListener("resize", run);
}

setDefaults();
bindEvents();
run();
