import { logSpace } from "./charts.js";
import { clamp } from "./format.js";

export function buildSolverTraceData(trace) {
  const x = [];
  const v3 = [];
  const vOut = [];
  for (const t of trace) {
    x.push(t.iteration);
    v3.push(t.v3);
    vOut.push(-t.v4);
  }
  return { x, v3, vOut };
}

export function buildSolverResidualData(trace, scale) {
  const x = [];
  const y = [];
  for (const t of trace) {
    x.push(t.iteration);
    if (scale === "log") {
      y.push(Math.log10(Math.max(Math.abs(t.residualV), 1e-18)));
    } else {
      y.push(Math.max(0, t.residualV));
    }
  }
  return {
    x,
    y,
    yLabel: scale === "log" ? "log10(Residual V)" : "Residual (V)",
    lineLabel: scale === "log" ? "log10 residual" : "residual",
  };
}

export function sweepFrequency(base, sweep, seedState, simulateWithState) {
  const x = logSpace(sweep.freqMinHz, sweep.freqMaxHz, sweep.freqPoints);
  const y = [];
  let state = seedState ? { ...seedState } : null;
  for (const f of x) {
    const solved = simulateWithState({ ...base, freqHz: f }, state);
    y.push(solved.result.vOutSteadyV);
    state = solved.state;
  }
  return { x, y };
}

export function sweepPosition(base, sweep, seedState, simulateWithState, centerTravelFraction) {
  const n = sweep.positionPoints;
  const x = [];
  const y = [];
  const halfSpan = 0.5 * centerTravelFraction;
  const pMin = clamp(0.5 - halfSpan, 0, 1);
  const pMax = clamp(0.5 + halfSpan, 0, 1);
  let state = seedState ? { ...seedState } : null;
  for (let i = 0; i < n; i++) {
    const p = pMin + (i / (n - 1)) * (pMax - pMin);
    x.push(p);
    const solved = simulateWithState({ ...base, position: p }, state);
    y.push(solved.result.vOutSteadyV);
    state = solved.state;
  }
  return { x, y };
}

export function sweepGap(base, sweep, seedState, simulateWithState) {
  const n = sweep.gapPoints;
  const x = [];
  const y = [];
  let state = seedState ? { ...seedState } : null;
  for (let i = 0; i < n; i++) {
    const g = sweep.gapMinMm + (i / (n - 1)) * (sweep.gapMaxMm - sweep.gapMinMm);
    x.push(g);
    const solved = simulateWithState({ ...base, totalGapMm: g }, state);
    y.push(solved.result.vOutSteadyV);
    state = solved.state;
  }
  return { x, y };
}

export function buildSensorCycleData(base, simulateSensorNodeWaveform) {
  const trace = simulateSensorNodeWaveform(base, {
    pointsPerCycle: 360,
    warmupCycles: 50,
  });
  return {
    x: trace.tS.map((t) => t * 1e6),
    va: trace.vaNodeV,
    vb: trace.vbNodeV,
  };
}
