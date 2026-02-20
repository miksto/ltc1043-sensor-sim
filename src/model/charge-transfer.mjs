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

  const sampledC3VoltageV = c3SampleV;
  const outputCapVoltageBeforeV = state.v4;
  const chargeSharingRatio = c3F / Math.max(c3F + c4F, 1e-18);
  const effectiveC3DriveV = chargeSharingRatio * sampledC3VoltageV;

  const transferEqCapF = (c3F * c4F) / Math.max(c3F + c4F, 1e-18);
  const qTransferC = transferGain * transferEqCapF * (effectiveC3DriveV - outputCapVoltageBeforeV);
  const c3VoltageAfterShareV = effectiveC3DriveV - qTransferC / c3F;
  let outputCapVoltageAfterV = outputCapVoltageBeforeV + qTransferC / c4F;
  outputCapVoltageAfterV -= deltaVBiasPerCycleV;
  const qSensorC = c3F * sampledC3VoltageV;

  if (useClamp) {
    outputCapVoltageAfterV = clamp(outputCapVoltageAfterV, clampMinV, clampMaxV);
  }

  return {
    state: { v3: c3VoltageAfterShareV, v4: outputCapVoltageAfterV },
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
