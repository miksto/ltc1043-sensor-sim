import { DEFAULT_INPUTS } from './defaults.mjs';
import { solveGeometry } from './geometry.mjs';

function assertFiniteNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function assertPositive(name, value) {
  if (value <= 0) {
    throw new RangeError(`${name} must be > 0`);
  }
}

function assertNonNegative(name, value) {
  if (value < 0) {
    throw new RangeError(`${name} must be >= 0`);
  }
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
  assertFiniteNumber('vDrivePeakV', vDrivePeakV);
  assertFiniteNumber('r10Ohm', r10Ohm);
  assertFiniteNumber('r11Ohm', r11Ohm);
  assertFiniteNumber('caF', caF);
  assertFiniteNumber('cbF', cbF);
  assertFiniteNumber('ccF', ccF);
  assertFiniteNumber('omega', omega);

  assertPositive('r10Ohm', r10Ohm);
  assertPositive('r11Ohm', r11Ohm);
  assertNonNegative('caF', caF);
  assertNonNegative('cbF', cbF);
  assertNonNegative('ccF', ccF);
  assertNonNegative('omega', omega);

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
    const vaFallback =
      vDrivePeakV / (1 + Math.max(omega, 0) * r10Ohm * Math.max(caF, 0));
    const vbFallback =
      vDrivePeakV / (1 + Math.max(omega, 0) * r11Ohm * Math.max(cbF, 0));
    return { vaNodeV: vaFallback, vbNodeV: vbFallback };
  }

  const vaNodeV = (b1 * a22 - a12 * b2) / det;
  const vbNodeV = (a11 * b2 - b1 * a21) / det;
  return { vaNodeV, vbNodeV };
}

export function simulateSensorNodeWaveform(input, options = {}) {
  const inputs = { ...DEFAULT_INPUTS, ...input };
  const { dLeftM, dRightM, caF, cbF } = solveGeometry(inputs);

  const freqHz = Math.max(inputs.freqHz, 1e-12);
  const periodS = 1 / freqHz;
  const halfPeriodS = periodS / 2;
  const driveV = inputs.vDrivePeakV;

  const pointsPerCycle = Math.max(
    80,
    Math.round(options.pointsPerCycle ?? 360),
  );
  const stepsPerHalf = Math.max(40, Math.floor(pointsPerCycle / 2));
  const warmupCycles = Math.max(1, Math.round(options.warmupCycles ?? 40));
  const dtS = halfPeriodS / stepsPerHalf;

  const cA = Math.max(caF, 1e-18);
  const cB = Math.max(cbF, 1e-18);
  const cC = Math.max(inputs.ccF, 0);
  const detC = cA * cB + cC * (cA + cB);
  const inv11 = (cB + cC) / Math.max(detC, 1e-24);
  const inv12 = cC / Math.max(detC, 1e-24);
  const inv21 = cC / Math.max(detC, 1e-24);
  const inv22 = (cA + cC) / Math.max(detC, 1e-24);
  const g10 = 1 / Math.max(inputs.r10Ohm, 1e-18);
  const g11 = 1 / Math.max(inputs.r11Ohm, 1e-18);

  let vaNodeV = 0;
  let vbNodeV = 0;

  function step(vSrc) {
    const iA = g10 * (vSrc - vaNodeV);
    const iB = g11 * (vSrc - vbNodeV);
    const dVaDt = inv11 * iA + inv12 * iB;
    const dVbDt = inv21 * iA + inv22 * iB;
    vaNodeV += dtS * dVaDt;
    vbNodeV += dtS * dVbDt;
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
  const vaTraceV = [vaNodeV];
  const vbTraceV = [vbNodeV];

  function traceHalf(vSrc, tStartS) {
    for (let i = 0; i < stepsPerHalf; i++) {
      step(vSrc);
      tS.push(tStartS + (i + 1) * dtS);
      vaTraceV.push(vaNodeV);
      vbTraceV.push(vbNodeV);
    }
  }

  traceHalf(+driveV, 0);
  traceHalf(-driveV, halfPeriodS);

  return {
    tS,
    vaNodeV: vaTraceV,
    vbNodeV: vbTraceV,
    periodS,
    dLeftM,
    dRightM,
    caF,
    cbF,
  };
}
