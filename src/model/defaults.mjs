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
