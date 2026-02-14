import { DEFAULT_SOLVER } from "../simulator-core.mjs";

export const REF = {
  centeredCapPF: 48.2,
  slopeVPerMm: 1.25,
  poleHz: 306,
};

export const SOLVER = { ...DEFAULT_SOLVER };

export const POSITION_SWEEP_CENTER_TRAVEL_FRACTION = 0.8;

export const DEFAULTS = {
  widthCm: Math.sqrt(43.5),
  heightCm: Math.sqrt(43.5),
  totalGapMm: 1.58,
  position: 0.5,
  positionOffsetMm: 0,
  residualScale: "linear",
  freqHz: 62500,
  vDrivePeakV: 5,
  r10Ohm: 10000,
  r11Ohm: 10000,
  rEqOhm: 1000000,
  c3F: 4700,
  c4F: 4700,
  ccF: 10,
  epsilonR: 1.0006,
  minGapMm: 0.05,
  freqMinHz: 1_000,
  freqMaxHz: 500_000,
  freqPoints: 180,
  gapMinMm: 0.4,
  gapMaxMm: 3.0,
  gapPoints: 140,
  positionPoints: 160,
};

export const INPUT_IDS = [
  "widthCm", "heightCm", "totalGapMm", "minGapMm", "position", "positionText", "positionOffsetMm", "freqHz",
  "plateAreaInfo",
  "residualScale",
  "vDrivePeakV", "epsilonR", "r10Ohm", "r11Ohm", "rEqOhm", "c3F", "c4F", "ccF",
  "freqMinHz", "freqMaxHz", "freqPoints", "gapMinMm", "gapMaxMm", "gapPoints", "positionPoints",
];
