import test from "node:test";
import assert from "node:assert/strict";
import {
  cycleStep,
  solvePeriodicSteadyState,
} from "../../src/model/charge-transfer.mjs";
import { DEFAULT_SOLVER } from "../../src/model/defaults.mjs";
import { nearAbs, runCases } from "../helpers/assertions.mjs";

test("cycleStep follows expected charge-sharing update without clamp", () => {
  const step = cycleStep(
    { v3: 0, v4: 0.2 },
    {
      c3F: 2,
      c4F: 3,
      c3SampleV: 1,
      deltaVBiasPerCycleV: 0.1,
      transferGain: 1,
      useClamp: false,
      clampMinV: -12,
      clampMaxV: 12,
    },
  );

  nearAbs(step.qTransferC, 0.24, 1e-12, "qTransfer");
  nearAbs(step.state.v3, 0.28, 1e-12, "v3");
  nearAbs(step.state.v4, 0.18, 1e-12, "v4");
});

test("cycleStep applies output clamp when enabled", () => {
  const step = cycleStep(
    { v3: 0, v4: 0.2 },
    {
      c3F: 2,
      c4F: 3,
      c3SampleV: 1,
      deltaVBiasPerCycleV: 0.1,
      transferGain: 1,
      useClamp: true,
      clampMinV: -0.1,
      clampMaxV: 0.1,
    },
  );

  nearAbs(step.state.v4, 0.1, 1e-12, "clamped v4");
});

test("solvePeriodicSteadyState closed-form matches analytic fixed point", () => {
  const derived = {
    c3F: 4.7e-9,
    c4F: 4.7e-9,
    c3SampleV: 0.2,
    deltaVBiasPerCycleV: 0,
  };
  const solver = { ...DEFAULT_SOLVER, useOutputClamp: false, transferGain: 1 };
  const solved = solvePeriodicSteadyState(derived, null, solver);

  const share = derived.c3F / (derived.c3F + derived.c4F);
  const v3Drive = share * derived.c3SampleV;
  const k = solver.transferGain * share;
  const expectedV4 = (k * v3Drive - derived.deltaVBiasPerCycleV) / k;

  assert.equal(solved.converged, true);
  nearAbs(solved.state.v4, expectedV4, 1e-12, "steady v4");
});

test("solvePeriodicSteadyState closed-form trace sampling keeps transient history", () => {
  const solved = solvePeriodicSteadyState(
    {
      c3F: 4.7e-9,
      c4F: 4.7e-9,
      c3SampleV: 0.2,
      deltaVBiasPerCycleV: 0,
    },
    null,
    { ...DEFAULT_SOLVER, collectTrace: true, useOutputClamp: false },
  );

  assert.ok(Array.isArray(solved.trace));
  assert.ok(solved.trace.length >= 10, `trace length=${solved.trace.length}`);
  assert.equal(solved.trace[0].iteration, 1);
  assert.equal(solved.trace.at(-1).iteration, solved.trace.length);
});

test("solvePeriodicSteadyState uses iterative path and converges when transferGain=0", () => {
  const solved = solvePeriodicSteadyState(
    {
      c3F: 1,
      c4F: 1,
      c3SampleV: 0.2,
      deltaVBiasPerCycleV: 0,
    },
    null,
    {
      ...DEFAULT_SOLVER,
      transferGain: 0,
      useOutputClamp: false,
      tolV: 1e-12,
      maxIter: 50,
    },
  );

  assert.equal(solved.converged, true);
  assert.ok(solved.iterations >= 2, `iterations=${solved.iterations}`);
});

test("solvePeriodicSteadyState iterative path reports non-convergence", () => {
  const solved = solvePeriodicSteadyState(
    {
      c3F: 1,
      c4F: 1,
      c3SampleV: 0.2,
      deltaVBiasPerCycleV: 0.01,
    },
    null,
    {
      ...DEFAULT_SOLVER,
      transferGain: 0,
      useOutputClamp: false,
      tolV: 1e-15,
      maxIter: 3,
      collectTrace: true,
    },
  );

  assert.equal(solved.converged, false);
  assert.equal(solved.iterations, 3);
  assert.equal(solved.trace.length, 3);
});

test("cycleStep throws for invalid state/derived contracts", () => {
  assert.throws(
    () => cycleStep(null, {}),
    TypeError,
  );
  assert.throws(
    () => cycleStep({ v3: 0, v4: Number.NaN }, {
      c3F: 1,
      c4F: 1,
      c3SampleV: 0.2,
      deltaVBiasPerCycleV: 0,
      transferGain: 1,
      useClamp: false,
      clampMinV: -1,
      clampMaxV: 1,
    }),
    TypeError,
  );

  runCases([
    { key: "c3F", value: 0 },
    { key: "c4F", value: -1 },
    { key: "clampMinV", value: 2, clampMaxV: 1 },
  ], ({ key, value, clampMaxV = 1 }) => {
    assert.throws(
      () => cycleStep(
        { v3: 0, v4: 0 },
        {
          c3F: 1,
          c4F: 1,
          c3SampleV: 0.2,
          deltaVBiasPerCycleV: 0,
          transferGain: 1,
          useClamp: false,
          clampMinV: -1,
          clampMaxV,
          [key]: value,
        },
      ),
      RangeError,
      `expected RangeError for ${key}`,
    );
  });

  assert.throws(
    () => cycleStep(
      { v3: 0, v4: 0 },
      {
        c3F: 1,
        c4F: 1,
        c3SampleV: 0.2,
        deltaVBiasPerCycleV: 0,
        transferGain: 1,
        useClamp: "yes",
        clampMinV: -1,
        clampMaxV: 1,
      },
    ),
    TypeError,
  );
  assert.throws(
    () => cycleStep({ v3: 0, v4: 0 }, null),
    TypeError,
  );
});

test("solvePeriodicSteadyState throws for invalid solver contract", () => {
  assert.throws(
    () => solvePeriodicSteadyState(
      {
        c3F: 1,
        c4F: 1,
        c3SampleV: 0.2,
        deltaVBiasPerCycleV: 0,
      },
      null,
      { ...DEFAULT_SOLVER, maxIter: 0 },
    ),
    RangeError,
  );
  assert.throws(
    () => solvePeriodicSteadyState(
      {
        c3F: 1,
        c4F: 1,
        c3SampleV: 0.2,
        deltaVBiasPerCycleV: 0,
      },
      null,
      { ...DEFAULT_SOLVER, useOutputClamp: 1 },
    ),
    TypeError,
  );
  assert.throws(
    () => solvePeriodicSteadyState(
      {
        c3F: 1,
        c4F: 1,
        c3SampleV: 0.2,
        deltaVBiasPerCycleV: 0,
      },
      null,
      { ...DEFAULT_SOLVER, tolV: -1 },
    ),
    RangeError,
  );
  assert.throws(
    () => solvePeriodicSteadyState(
      {
        c3F: 1,
        c4F: 1,
        c3SampleV: 0.2,
        deltaVBiasPerCycleV: 0,
      },
      null,
      null,
    ),
    TypeError,
  );
  assert.throws(
    () => solvePeriodicSteadyState(
      null,
      null,
      DEFAULT_SOLVER,
    ),
    TypeError,
  );
  assert.throws(
    () => solvePeriodicSteadyState(
      {
        c3F: 1,
        c4F: 1,
        c3SampleV: 0.2,
        deltaVBiasPerCycleV: 0,
      },
      { v3: 0, v4: Number.NaN },
      DEFAULT_SOLVER,
    ),
    TypeError,
  );
});
