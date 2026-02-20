import { DEFAULT_SOLVER } from "./defaults.mjs";

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function cycleStep(state, derived) {
  const {
    c3F,
    c4F,
    c3SampleV,
    deltaVBiasPerCycleV,
    transferGain,
    useClamp,
    clampMinV,
    clampMaxV,
  } = derived;

  const v3A = c3SampleV;
  const v4A = state.v4;
  const shareRatio = c3F / Math.max(c3F + c4F, 1e-18);
  const v3Drive = shareRatio * v3A;

  const cEqF = (c3F * c4F) / Math.max(c3F + c4F, 1e-18);
  const qTransferC = transferGain * cEqF * (v3Drive - v4A);
  const v3B = v3Drive - qTransferC / c3F;
  let v4B = v4A + qTransferC / c4F;
  v4B -= deltaVBiasPerCycleV;
  const qSensorC = c3F * v3A;

  if (useClamp) {
    v4B = clamp(v4B, clampMinV, clampMaxV);
  }

  return {
    state: { v3: v3B, v4: v4B },
    qSensorC,
    qTransferC,
  };
}

export function solvePeriodicSteadyState(derived, initialState = null, solver = DEFAULT_SOLVER) {
  let state = initialState
    ? { v3: initialState.v3, v4: initialState.v4 }
    : { v3: 0, v4: 0 };

  let residualV = Infinity;
  let iterations = 0;
  let qSensorC = 0;
  let qTransferC = 0;
  const trace = solver.collectTrace ? [] : null;

  for (let i = 0; i < solver.maxIter; i++) {
    const prevV3 = state.v3;
    const prevV4 = state.v4;
    const step = cycleStep(state, {
      ...derived,
      transferGain: solver.transferGain,
      useClamp: solver.useOutputClamp,
      clampMinV: solver.clampMinV,
      clampMaxV: solver.clampMaxV,
    });
    state = step.state;
    qSensorC = step.qSensorC;
    qTransferC = step.qTransferC;
    residualV = Math.max(Math.abs(state.v3 - prevV3), Math.abs(state.v4 - prevV4));
    iterations = i + 1;
    if (trace) {
      trace.push({
        iteration: iterations,
        v3: state.v3,
        v4: state.v4,
        residualV,
      });
    }

    if (residualV < solver.tolV) {
      return { converged: true, iterations, residualV, state, qSensorC, qTransferC, trace };
    }
  }

  return { converged: false, iterations, residualV, state, qSensorC, qTransferC, trace };
}
