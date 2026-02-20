import {
  DEFAULT_INPUTS,
  DEFAULT_SOLVER,
  EPS0,
} from "./model/defaults.mjs";
import { solveGeometry } from "./model/geometry.mjs";

export { DEFAULT_INPUTS, DEFAULT_SOLVER, EPS0 };

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

export function solveSensorNodeVoltages({
  vDrivePeakV,
  r10Ohm,
  r11Ohm,
  caF,
  cbF,
  ccF,
  omega,
}) {
  const g10 = 1 / Math.max(r10Ohm, 1e-18);
  const g11 = 1 / Math.max(r11Ohm, 1e-18);
  const k = Math.max(omega, 0) * Math.max(ccF, 0);

  // Linearized RC-domain nodal solve (matches V=Vclk/(1+omega*R*C) for single-node case):
  // (Va - Vs)/R10 + omega*Ca*Va + omega*Cc*(Va - Vb) = 0
  // (Vb - Vs)/R11 + omega*Cb*Vb + omega*Cc*(Vb - Va) = 0
  const a11 = g10 + Math.max(omega, 0) * Math.max(caF, 0) + k;
  const a12 = -k;
  const a21 = -k;
  const a22 = g11 + Math.max(omega, 0) * Math.max(cbF, 0) + k;
  const b1 = g10 * vDrivePeakV;
  const b2 = g11 * vDrivePeakV;

  const det = a11 * a22 - a12 * a21;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-30) {
    const vaFallback = vDrivePeakV / (1 + Math.max(omega, 0) * r10Ohm * Math.max(caF, 0));
    const vbFallback = vDrivePeakV / (1 + Math.max(omega, 0) * r11Ohm * Math.max(cbF, 0));
    return { vaNodeV: vaFallback, vbNodeV: vbFallback };
  }

  const vaNodeV = (b1 * a22 - a12 * b2) / det;
  const vbNodeV = (a11 * b2 - b1 * a21) / det;
  return { vaNodeV, vbNodeV };
}

export function simulateSensorNodeWaveform(input, options = {}) {
  const p = { ...DEFAULT_INPUTS, ...input };
  const { dLeftM, dRightM, caF, cbF } = solveGeometry(p);

  const freqHz = Math.max(p.freqHz, 1e-12);
  const periodS = 1 / freqHz;
  const halfPeriodS = periodS / 2;
  const driveV = p.vDrivePeakV;

  const pointsPerCycle = Math.max(80, Math.round(options.pointsPerCycle ?? 360));
  const stepsPerHalf = Math.max(40, Math.floor(pointsPerCycle / 2));
  const warmupCycles = Math.max(1, Math.round(options.warmupCycles ?? 40));
  const dtS = halfPeriodS / stepsPerHalf;

  const cA = Math.max(caF, 1e-18);
  const cB = Math.max(cbF, 1e-18);
  const cC = Math.max(p.ccF, 0);
  const detC = cA * cB + cC * (cA + cB);
  const inv11 = (cB + cC) / Math.max(detC, 1e-24);
  const inv12 = cC / Math.max(detC, 1e-24);
  const inv21 = cC / Math.max(detC, 1e-24);
  const inv22 = (cA + cC) / Math.max(detC, 1e-24);
  const g10 = 1 / Math.max(p.r10Ohm, 1e-18);
  const g11 = 1 / Math.max(p.r11Ohm, 1e-18);

  let va = 0;
  let vb = 0;

  function step(vSrc) {
    const iA = g10 * (vSrc - va);
    const iB = g11 * (vSrc - vb);
    const dvaDt = inv11 * iA + inv12 * iB;
    const dvbDt = inv21 * iA + inv22 * iB;
    va += dtS * dvaDt;
    vb += dtS * dvbDt;
  }

  function integrateHalf(vSrc) {
    for (let i = 0; i < stepsPerHalf; i++) {
      step(vSrc);
    }
  }

  for (let i = 0; i < warmupCycles; i++) {
    integrateHalf(+driveV);
    integrateHalf(-driveV);
  }

  const tS = [0];
  const vaNodeV = [va];
  const vbNodeV = [vb];

  function traceHalf(vSrc, tStartS) {
    for (let i = 0; i < stepsPerHalf; i++) {
      step(vSrc);
      tS.push(tStartS + (i + 1) * dtS);
      vaNodeV.push(va);
      vbNodeV.push(vb);
    }
  }

  traceHalf(+driveV, 0);
  traceHalf(-driveV, halfPeriodS);

  return {
    tS,
    vaNodeV,
    vbNodeV,
    periodS,
    dLeftM,
    dRightM,
    caF,
    cbF,
  };
}

export function simulateWithState(input, initialState = null, solver = DEFAULT_SOLVER) {
  const p = { ...DEFAULT_INPUTS, ...input };

  const warnings = [];
  const c3F = Math.max(p.c3F, 1e-18);
  const c4F = Math.max(p.c4F, 1e-18);
  const {
    dLeftM,
    dRightM,
    caF,
    cbF,
    deltaCF,
  } = solveGeometry(p);

  const omega = 2 * Math.PI * Math.max(p.freqHz, 1e-12);
  const { vaNodeV, vbNodeV } = solveSensorNodeVoltages({
    vDrivePeakV: p.vDrivePeakV,
    r10Ohm: p.r10Ohm,
    r11Ohm: p.r11Ohm,
    caF,
    cbF,
    ccF: p.ccF,
    omega,
  });
  const deltaVinV = vaNodeV - vbNodeV;
  // Keep historical output polarity (vOut = -v4) by inverting sampled differential sign.
  const c3SampleV = -deltaVinV;
  const qPacketC = c3F * c3SampleV;

  const T = 1 / Math.max(p.freqHz, 1e-12);
  const iBiasA = Number.isFinite(p.iBiasA) ? p.iBiasA : DEFAULT_INPUTS.iBiasA;
  const deltaVBiasPerCycleV = (iBiasA * T) / c4F;

  const solved = solvePeriodicSteadyState(
    {
      c3F,
      c4F,
      c3SampleV,
      deltaVBiasPerCycleV,
    },
    initialState,
    solver,
  );

  const vOutSteadyV = -solved.state.v4;
  const qToC4C = solved.qTransferC;

  const tHalf = 1 / (2 * Math.max(p.freqHz, 1e-12));
  // 5*tau warning is a heuristic; for mutual Cc, branch RC is best represented
  // by the direct shunt capacitances (Ca/Cb) rather than treating Cc as ground shunt.
  const tauA = p.r10Ohm * caF;
  const tauB = p.r11Ohm * cbF;
  const tauMax = Math.max(tauA, tauB);
  const fWarningThresholdHz = 1 / (10 * Math.max(tauMax, 1e-18));

  if (tHalf < 5 * tauMax) {
    warnings.push("Full-charge assumption may be invalid at this frequency.");
  }

  if (!solved.converged) {
    warnings.push("Steady-state solver did not converge; result may be approximate.");
  }

  if (solver.useOutputClamp) {
    const nearMin = Math.abs(solved.state.v4 - solver.clampMinV) < 1e-6;
    const nearMax = Math.abs(solved.state.v4 - solver.clampMaxV) < 1e-6;
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
      qPacketC,
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
      solverIterations: solved.iterations,
      solverResidualV: solved.residualV,
      solverConverged: solved.converged,
      v3SteadyV: solved.state.v3,
      qTransferCycleC: solved.qTransferC,
    },
    state: solved.state,
    trace: solved.trace || [],
  };
}

export function simulate(input, solver = DEFAULT_SOLVER) {
  return simulateWithState(input, null, solver).result;
}
