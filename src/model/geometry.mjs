import { EPS0 } from "./defaults.mjs";

export function solveGeometry(inputs) {
  const areaM2 = (inputs.widthCm * 1e-2) * (inputs.heightCm * 1e-2);
  const totalGapM = inputs.totalGapMm * 1e-3;
  const minGapM = inputs.minGapMm * 1e-3;
  const dLeftM = Math.max(minGapM, inputs.position * totalGapM);
  const dRightM = Math.max(minGapM, (1 - inputs.position) * totalGapM);
  const caF = (EPS0 * inputs.epsilonR * areaM2) / Math.max(dLeftM, 1e-15);
  const cbF = (EPS0 * inputs.epsilonR * areaM2) / Math.max(dRightM, 1e-15);
  const deltaCF = caF - cbF;

  return {
    areaM2,
    totalGapM,
    minGapM,
    dLeftM,
    dRightM,
    caF,
    cbF,
    deltaCF,
  };
}
