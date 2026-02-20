import { DEFAULT_INPUTS, DEFAULT_SOLVER } from '../simulator-core.mjs';

export const REF = {
  centeredCapPF: 48.2,
  slopeVPerMm: 1.25,
};

export const SOLVER = { ...DEFAULT_SOLVER };

export const POSITION_SWEEP_CENTER_TRAVEL_FRACTION = 0.8;

export const DEFAULTS = {
  widthCm: DEFAULT_INPUTS.widthCm,
  heightCm: DEFAULT_INPUTS.heightCm,
  totalGapMm: DEFAULT_INPUTS.totalGapMm,
  position: 0.5,
  positionOffsetMm: 0,
  residualScale: 'linear',
  freqHz: DEFAULT_INPUTS.freqHz,
  vDrivePeakV: DEFAULT_INPUTS.vDrivePeakV,
  r10Ohm: DEFAULT_INPUTS.r10Ohm,
  r11Ohm: DEFAULT_INPUTS.r11Ohm,
  iBiasPA: DEFAULT_INPUTS.iBiasA * 1e12,
  c3F: DEFAULT_INPUTS.c3F * 1e12,
  c4F: DEFAULT_INPUTS.c4F * 1e12,
  ccF: DEFAULT_INPUTS.ccF * 1e12,
  epsilonR: DEFAULT_INPUTS.epsilonR,
  minGapMm: DEFAULT_INPUTS.minGapMm,
  freqMinHz: 1_000,
  freqMaxHz: 500_000,
  freqPoints: 180,
  gapMinMm: 0.4,
  gapMaxMm: 3.0,
  gapPoints: 140,
  positionPoints: 160,
};

export const INPUT_IDS = [
  'widthCm',
  'heightCm',
  'totalGapMm',
  'minGapMm',
  'position',
  'positionText',
  'positionOffsetMm',
  'freqHz',
  'plateAreaInfo',
  'residualScale',
  'vDrivePeakV',
  'epsilonR',
  'r10Ohm',
  'r11Ohm',
  'iBiasPA',
  'c3F',
  'c4F',
  'ccF',
  'freqMinHz',
  'freqMaxHz',
  'freqPoints',
  'gapMinMm',
  'gapMaxMm',
  'gapPoints',
  'positionPoints',
];
