import { DEFAULT_INPUTS, DEFAULT_SOLVER, EPS0 } from './model/defaults.mjs';
import { solveGeometry } from './model/geometry.mjs';
import {
  simulateSensorNodeWaveform,
  solveSensorNodeVoltages,
} from './model/sensor-network.mjs';
import {
  clamp,
  cycleStep,
  solvePeriodicSteadyState,
} from './model/charge-transfer.mjs';

export { DEFAULT_INPUTS, DEFAULT_SOLVER, EPS0 };
export { clamp, cycleStep, solvePeriodicSteadyState };
export { simulateSensorNodeWaveform, solveSensorNodeVoltages };

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function toFiniteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toPositiveNumber(value, fallback) {
  const n = toFiniteNumber(value, fallback);
  return n > 0 ? n : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const n = toFiniteNumber(value, fallback);
  return n >= 0 ? n : fallback;
}

function toBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function toPositiveInteger(value, fallback) {
  const n = toFiniteNumber(value, fallback);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

function normalizeInputs(input) {
  const raw = { ...DEFAULT_INPUTS, ...asRecord(input) };
  const totalGapMm = toPositiveNumber(
    raw.totalGapMm,
    DEFAULT_INPUTS.totalGapMm,
  );
  const minGapMmRaw = toPositiveNumber(raw.minGapMm, DEFAULT_INPUTS.minGapMm);
  const minGapMm = Math.min(minGapMmRaw, totalGapMm);

  return {
    widthCm: toPositiveNumber(raw.widthCm, DEFAULT_INPUTS.widthCm),
    heightCm: toPositiveNumber(raw.heightCm, DEFAULT_INPUTS.heightCm),
    totalGapMm,
    minGapMm,
    position: clamp(
      toFiniteNumber(raw.position, DEFAULT_INPUTS.position),
      0,
      1,
    ),
    freqHz: toPositiveNumber(raw.freqHz, DEFAULT_INPUTS.freqHz),
    vDrivePeakV: toFiniteNumber(raw.vDrivePeakV, DEFAULT_INPUTS.vDrivePeakV),
    r10Ohm: toPositiveNumber(raw.r10Ohm, DEFAULT_INPUTS.r10Ohm),
    r11Ohm: toPositiveNumber(raw.r11Ohm, DEFAULT_INPUTS.r11Ohm),
    iBiasA: toFiniteNumber(raw.iBiasA, DEFAULT_INPUTS.iBiasA),
    c3F: toPositiveNumber(raw.c3F, DEFAULT_INPUTS.c3F),
    c4F: toPositiveNumber(raw.c4F, DEFAULT_INPUTS.c4F),
    ccF: toNonNegativeNumber(raw.ccF, DEFAULT_INPUTS.ccF),
    epsilonR: toPositiveNumber(raw.epsilonR, DEFAULT_INPUTS.epsilonR),
  };
}

function normalizeSolver(solver) {
  const raw = { ...DEFAULT_SOLVER, ...asRecord(solver) };
  const clampA = toFiniteNumber(raw.clampMinV, DEFAULT_SOLVER.clampMinV);
  const clampB = toFiniteNumber(raw.clampMaxV, DEFAULT_SOLVER.clampMaxV);
  const clampMinV = Math.min(clampA, clampB);
  const clampMaxV = Math.max(clampA, clampB);

  return {
    tolV: toNonNegativeNumber(raw.tolV, DEFAULT_SOLVER.tolV),
    maxIter: toPositiveInteger(raw.maxIter, DEFAULT_SOLVER.maxIter),
    transferGain: toFiniteNumber(raw.transferGain, DEFAULT_SOLVER.transferGain),
    useOutputClamp: toBoolean(
      raw.useOutputClamp,
      DEFAULT_SOLVER.useOutputClamp,
    ),
    clampMinV,
    clampMaxV,
    collectTrace: toBoolean(raw.collectTrace, DEFAULT_SOLVER.collectTrace),
  };
}

function normalizeState(initialState) {
  if (!initialState || typeof initialState !== 'object') return null;
  if (!Number.isFinite(initialState.v3) || !Number.isFinite(initialState.v4))
    return null;
  return { v3: initialState.v3, v4: initialState.v4 };
}

export function simulateWithState(
  input,
  initialState = null,
  solver = DEFAULT_SOLVER,
) {
  const inputs = normalizeInputs(input);
  const normalizedSolver = normalizeSolver(solver);
  const normalizedState = normalizeState(initialState);

  const warnings = [];
  const c3F = Math.max(inputs.c3F, 1e-18);
  const c4F = Math.max(inputs.c4F, 1e-18);
  const { dLeftM, dRightM, caF, cbF, deltaCF } = solveGeometry(inputs);

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
  const iBiasA = inputs.iBiasA;
  const deltaVBiasPerCycleV = (iBiasA * T) / c4F;

  let steadyState;
  try {
    steadyState = solvePeriodicSteadyState(
      {
        c3F,
        c4F,
        c3SampleV,
        deltaVBiasPerCycleV,
      },
      normalizedState,
      normalizedSolver,
    );
  } catch {
    steadyState = {
      converged: false,
      iterations: 0,
      residualV: Number.NaN,
      state: { v3: 0, v4: Number.NaN },
      qSensorC: Number.NaN,
      qTransferC: Number.NaN,
      trace: [],
    };
  }

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
    warnings.push('Full-charge assumption may be invalid at this frequency.');
  }

  if (!steadyState.converged) {
    warnings.push(
      'Steady-state solver did not converge; result may be approximate.',
    );
  }

  if (normalizedSolver.useOutputClamp) {
    const nearMin =
      Math.abs(steadyState.state.v4 - normalizedSolver.clampMinV) < 1e-6;
    const nearMax =
      Math.abs(steadyState.state.v4 - normalizedSolver.clampMaxV) < 1e-6;
    if (nearMin || nearMax) {
      warnings.push('Output clamp is active; saturation limits reached.');
    }
  }

  if (!Number.isFinite(vOutSteadyV)) {
    warnings.push('Numeric instability detected; check parameter ranges.');
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
