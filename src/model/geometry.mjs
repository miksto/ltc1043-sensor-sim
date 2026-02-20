import { EPS0 } from './defaults.mjs';

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

export function solveGeometry(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    throw new TypeError('inputs must be an object');
  }

  assertFiniteNumber('inputs.widthCm', inputs.widthCm);
  assertFiniteNumber('inputs.heightCm', inputs.heightCm);
  assertFiniteNumber('inputs.totalGapMm', inputs.totalGapMm);
  assertFiniteNumber('inputs.minGapMm', inputs.minGapMm);
  assertFiniteNumber('inputs.position', inputs.position);
  assertFiniteNumber('inputs.epsilonR', inputs.epsilonR);

  assertPositive('inputs.widthCm', inputs.widthCm);
  assertPositive('inputs.heightCm', inputs.heightCm);
  assertPositive('inputs.totalGapMm', inputs.totalGapMm);
  assertPositive('inputs.minGapMm', inputs.minGapMm);
  assertPositive('inputs.epsilonR', inputs.epsilonR);

  if (inputs.minGapMm > inputs.totalGapMm) {
    throw new RangeError('inputs.minGapMm must be <= inputs.totalGapMm');
  }
  if (inputs.position < 0 || inputs.position > 1) {
    throw new RangeError('inputs.position must be within [0, 1]');
  }

  const areaM2 = inputs.widthCm * 1e-2 * (inputs.heightCm * 1e-2);
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
