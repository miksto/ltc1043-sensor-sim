export const EPS0 = 8.8541878128e-12;

export const DEFAULT_SOLVER = {
  tolV: 1e-9,
  maxIter: 10000,
  transferGain: 1.0,
  useOutputClamp: true,
  clampMinV: -12,
  clampMaxV: 12,
  collectTrace: false,
};

export const DEFAULT_INPUTS = {
  widthCm: Math.sqrt(43.5),
  heightCm: Math.sqrt(43.5),
  totalGapMm: 1.58,
  minGapMm: 0.05,
  position: 0.5,
  freqHz: 62500,
  vDrivePeakV: 5,
  r10Ohm: 10000,
  r11Ohm: 10000,
  // AD706 typical input bias current at 25C (datasheet, Vcm = 0 V).
  iBiasA: 50e-12,
  c3F: 4700e-12,
  c4F: 4700e-12,
  ccF: 10e-12,
  epsilonR: 1.0006,
};

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

export function simulateWithState(input, initialState = null, solver = DEFAULT_SOLVER) {
  const p = { ...DEFAULT_INPUTS, ...input };

  const warnings = [];
  const c3F = Math.max(p.c3F, 1e-18);
  const c4F = Math.max(p.c4F, 1e-18);
  const areaM2 = (p.widthCm * 1e-2) * (p.heightCm * 1e-2);
  const totalGapM = p.totalGapMm * 1e-3;
  const minGapM = p.minGapMm * 1e-3;

  const dLeftM = Math.max(minGapM, p.position * totalGapM);
  const dRightM = Math.max(minGapM, (1 - p.position) * totalGapM);

  const caF = (EPS0 * p.epsilonR * areaM2) / Math.max(dLeftM, 1e-15);
  const cbF = (EPS0 * p.epsilonR * areaM2) / Math.max(dRightM, 1e-15);
  const deltaCF = caF - cbF;

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
  const tauA = p.r10Ohm * (caF + p.ccF);
  const tauB = p.r11Ohm * (cbF + p.ccF);
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
