import {
  DEFAULT_INPUTS,
  DEFAULT_SOLVER,
  EPS0,
} from "./model/defaults.mjs";
import { solveGeometry } from "./model/geometry.mjs";
import {
  simulateSensorNodeWaveform,
  solveSensorNodeVoltages,
} from "./model/sensor-network.mjs";
import {
  clamp,
  cycleStep,
  solvePeriodicSteadyState,
} from "./model/charge-transfer.mjs";

export { DEFAULT_INPUTS, DEFAULT_SOLVER, EPS0 };
export { clamp, cycleStep, solvePeriodicSteadyState };
export { simulateSensorNodeWaveform, solveSensorNodeVoltages };

export function simulateWithState(input, initialState = null, solver = DEFAULT_SOLVER) {
  const inputs = { ...DEFAULT_INPUTS, ...input };

  const warnings = [];
  const c3F = Math.max(inputs.c3F, 1e-18);
  const c4F = Math.max(inputs.c4F, 1e-18);
  const {
    dLeftM,
    dRightM,
    caF,
    cbF,
    deltaCF,
  } = solveGeometry(inputs);

  const omega = 2 * Math.PI * Math.max(inputs.freqHz, 1e-12);
  const { vaNodeV, vbNodeV } = solveSensorNodeVoltages({
    vDrivePeakV: inputs.vDrivePeakV,
    r10Ohm: inputs.r10Ohm,
    r11Ohm: inputs.r11Ohm,
    caF,
    cbF,
    ccF: inputs.ccF,
    omega,
  });
  const deltaVinV = vaNodeV - vbNodeV;
  // Keep historical output polarity (vOut = -v4) by inverting sampled differential sign.
  const c3SampleV = -deltaVinV;
  const qSampleOnC3C = c3F * c3SampleV;

  const T = 1 / Math.max(inputs.freqHz, 1e-12);
  const iBiasA = Number.isFinite(inputs.iBiasA) ? inputs.iBiasA : DEFAULT_INPUTS.iBiasA;
  const deltaVBiasPerCycleV = (iBiasA * T) / c4F;

  const steadyState = solvePeriodicSteadyState(
    {
      c3F,
      c4F,
      c3SampleV,
      deltaVBiasPerCycleV,
    },
    initialState,
    solver,
  );

  const vOutSteadyV = -steadyState.state.v4;
  const qToC4C = steadyState.qTransferC;

  const tHalf = 1 / (2 * Math.max(inputs.freqHz, 1e-12));
  // 5*tau warning is a heuristic; for mutual Cc, branch RC is best represented
  // by the direct shunt capacitances (Ca/Cb) rather than treating Cc as ground shunt.
  const tauA = inputs.r10Ohm * caF;
  const tauB = inputs.r11Ohm * cbF;
  const tauMax = Math.max(tauA, tauB);
  const fWarningThresholdHz = 1 / (10 * Math.max(tauMax, 1e-18));

  if (tHalf < 5 * tauMax) {
    warnings.push("Full-charge assumption may be invalid at this frequency.");
  }

  if (!steadyState.converged) {
    warnings.push("Steady-state solver did not converge; result may be approximate.");
  }

  if (solver.useOutputClamp) {
    const nearMin = Math.abs(steadyState.state.v4 - solver.clampMinV) < 1e-6;
    const nearMax = Math.abs(steadyState.state.v4 - solver.clampMaxV) < 1e-6;
    if (nearMin || nearMax) {
      warnings.push("Output clamp is active; saturation limits reached.");
    }
  }

  if (!Number.isFinite(vOutSteadyV)) {
    warnings.push("Numeric instability detected; check parameter ranges.");
  }

  return {
    result: {
      caF,
      cbF,
      deltaCF,
      qPacketC: qSampleOnC3C,
      qSampleOnC3C,
      qToC4C,
      vOutSteadyV,
      vaNodeV,
      vbNodeV,
      deltaVinV,
      iBiasA,
      deltaVBiasPerCycleV,
      warnings,
      dLeftM,
      dRightM,
      tauAS: tauA,
      tauBS: tauB,
      fWarningThresholdHz,
      solverIterations: steadyState.iterations,
      solverResidualV: steadyState.residualV,
      solverConverged: steadyState.converged,
      v3SteadyV: steadyState.state.v3,
      qTransferCycleC: steadyState.qTransferC,
    },
    state: steadyState.state,
    trace: steadyState.trace || [],
  };
}

export function simulate(input, solver = DEFAULT_SOLVER) {
  return simulateWithState(input, null, solver).result;
}
