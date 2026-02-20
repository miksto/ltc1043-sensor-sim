import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INPUTS } from "../../src/model/defaults.mjs";
import { solveGeometry } from "../../src/model/geometry.mjs";
import { nearAbs, runCases } from "../helpers/assertions.mjs";

test("solveGeometry gives symmetric capacitances at centered position", () => {
  const out = solveGeometry({ ...DEFAULT_INPUTS, position: 0.5 });
  nearAbs(out.caF, out.cbF, 1e-24, "Ca/Cb symmetry");
  assert.ok(out.caF > 0);
  assert.ok(out.cbF > 0);
});

test("solveGeometry changes Ca/Cb monotonically with position", () => {
  const left = solveGeometry({ ...DEFAULT_INPUTS, position: 0.25 });
  const right = solveGeometry({ ...DEFAULT_INPUTS, position: 0.75 });
  assert.ok(left.caF > right.caF, `left.caF=${left.caF}, right.caF=${right.caF}`);
  assert.ok(left.cbF < right.cbF, `left.cbF=${left.cbF}, right.cbF=${right.cbF}`);
});

test("solveGeometry clamps distances with min gap at extremes", () => {
  const left = solveGeometry({ ...DEFAULT_INPUTS, position: 0.0, minGapMm: 0.05 });
  const right = solveGeometry({ ...DEFAULT_INPUTS, position: 1.0, minGapMm: 0.05 });
  nearAbs(left.dLeftM, 0.05e-3, 1e-18, "left min gap");
  nearAbs(right.dRightM, 0.05e-3, 1e-18, "right min gap");
});

test("solveGeometry scales linearly with area and dielectric constant", () => {
  const base = solveGeometry({ ...DEFAULT_INPUTS, position: 0.5 });
  const doubledArea = solveGeometry({
    ...DEFAULT_INPUTS,
    widthCm: DEFAULT_INPUTS.widthCm * 2,
    position: 0.5,
  });
  const tripledEpsilon = solveGeometry({
    ...DEFAULT_INPUTS,
    epsilonR: DEFAULT_INPUTS.epsilonR * 3,
    position: 0.5,
  });

  nearAbs(doubledArea.caF / base.caF, 2, 1e-12, "area ratio");
  nearAbs(tripledEpsilon.caF / base.caF, 3, 1e-12, "epsilon ratio");
});

test("solveGeometry throws TypeError for non-finite numeric inputs", () => {
  runCases([
    { key: "widthCm", value: Number.NaN },
    { key: "heightCm", value: Number.POSITIVE_INFINITY },
    { key: "totalGapMm", value: Number.NEGATIVE_INFINITY },
    { key: "minGapMm", value: Number.NaN },
    { key: "position", value: Number.NaN },
    { key: "epsilonR", value: Number.NaN },
  ], ({ key, value }) => {
    assert.throws(
      () => solveGeometry({ ...DEFAULT_INPUTS, [key]: value }),
      TypeError,
      `expected TypeError for ${key}`,
    );
  });
});

test("solveGeometry throws RangeError for invalid ranges", () => {
  runCases([
    { key: "widthCm", value: 0 },
    { key: "heightCm", value: -1 },
    { key: "totalGapMm", value: 0 },
    { key: "minGapMm", value: -0.01 },
    { key: "epsilonR", value: 0 },
  ], ({ key, value }) => {
    assert.throws(
      () => solveGeometry({ ...DEFAULT_INPUTS, [key]: value }),
      RangeError,
      `expected RangeError for ${key}`,
    );
  });

  assert.throws(
    () => solveGeometry({ ...DEFAULT_INPUTS, position: -0.01 }),
    RangeError,
    "position below range",
  );
  assert.throws(
    () => solveGeometry({ ...DEFAULT_INPUTS, position: 1.01 }),
    RangeError,
    "position above range",
  );
  assert.throws(
    () => solveGeometry({ ...DEFAULT_INPUTS, minGapMm: DEFAULT_INPUTS.totalGapMm + 0.1 }),
    RangeError,
    "min gap larger than total gap",
  );
});
