import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INPUTS,
  DEFAULT_SOLVER,
  simulate,
  simulateWithState,
} from '../src/simulator-core.mjs';

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

function docFixture(overrides = {}) {
  const sideCm = Math.sqrt(43.5);
  return {
    ...DEFAULT_INPUTS,
    widthCm: sideCm,
    heightCm: sideCm,
    totalGapMm: 1.58,
    minGapMm: 0.05,
    position: 0.5,
    freqHz: 62500,
    vDrivePeakV: 5,
    r10Ohm: 20000,
    r11Ohm: 20000,
    iBiasA: 50e-12,
    c3F: 4.7e-9,
    c4F: 4.7e-9,
    ccF: 0,
    epsilonR: 1,
    ...overrides,
  };
}

function positionFromDisplacementMm(xMm, totalGapMm) {
  return 0.5 - (xMm / totalGapMm);
}

function simulateTransientCycles(input, cycles) {
  return simulateWithState(
    input,
    null,
    {
      ...DEFAULT_SOLVER,
      tolV: 0,
      maxIter: cycles,
      transferGain: 1,
      useOutputClamp: false,
      collectTrace: false,
    },
  ).result;
}

test('centered geometry gives Ca≈Cb', () => {
  const r = simulate({ ...DEFAULT_INPUTS, position: 0.5 });
  assert.ok(near(r.caF, r.cbF, 1e-24), `ca=${r.caF}, cb=${r.cbF}`);
});

test('edge positions remain finite due to min-gap clamp', () => {
  const left = simulate({ ...DEFAULT_INPUTS, position: 0.0 });
  const right = simulate({ ...DEFAULT_INPUTS, position: 1.0 });
  assert.ok(Number.isFinite(left.caF) && Number.isFinite(left.cbF));
  assert.ok(Number.isFinite(right.caF) && Number.isFinite(right.cbF));
});

test('increasing position toward right increases Vout sign', () => {
  const low = simulate({ ...DEFAULT_INPUTS, position: 0.4 }).vOutSteadyV;
  const high = simulate({ ...DEFAULT_INPUTS, position: 0.6 }).vOutSteadyV;
  assert.ok(high > low, `low=${low}, high=${high}`);
});

test('high-frequency full-charge warning appears at very high switching frequency', () => {
  const r = simulate({ ...DEFAULT_INPUTS, freqHz: 1_000_000 });
  assert.ok(r.warnings.some((w) => w.includes('Full-charge assumption may be invalid')));
});

test('low-frequency full-charge warning clears with defaults', () => {
  const r = simulate({ ...DEFAULT_INPUTS, freqHz: 1000 });
  assert.ok(!r.warnings.some((w) => w.includes('Full-charge assumption may be invalid')));
});

test('solver converges at defaults', () => {
  const r = simulate({ ...DEFAULT_INPUTS });
  assert.equal(r.solverConverged, true);
  assert.ok(r.solverIterations > 0);
  assert.ok(r.solverResidualV < 1e-7);
});

test('output remains bounded for large op-amp bias current due to equilibrium/clamp', () => {
  const r = simulate({ ...DEFAULT_INPUTS, position: 0.6, iBiasA: 1e-6 });
  assert.ok(Number.isFinite(r.vOutSteadyV));
  assert.ok(Math.abs(r.vOutSteadyV) <= Math.abs(DEFAULT_SOLVER.clampMaxV) + 1e-9);
});

test('state warm-start path returns finite and converged neighboring points', () => {
  const first = simulateWithState({ ...DEFAULT_INPUTS, freqHz: 20000 }, null);
  const second = simulateWithState({ ...DEFAULT_INPUTS, freqHz: 22000 }, first.state);
  assert.ok(first.result.solverConverged);
  assert.ok(second.result.solverConverged);
  assert.ok(Number.isFinite(first.result.vOutSteadyV));
  assert.ok(Number.isFinite(second.result.vOutSteadyV));
});

test('solver trace is collected when enabled', () => {
  const solved = simulateWithState(
    { ...DEFAULT_INPUTS },
    null,
    { ...DEFAULT_SOLVER, collectTrace: true },
  );
  assert.ok(Array.isArray(solved.trace));
  assert.ok(solved.trace.length > 0);
  assert.equal(solved.trace.length, solved.result.solverIterations);
  assert.equal(solved.trace.at(-1).iteration, solved.result.solverIterations);
});

test('no NaN/Infinity across sampled operating range', () => {
  for (let i = 0; i < 120; i++) {
    const t = i / 119;
    const r = simulate({
      ...DEFAULT_INPUTS,
      position: t,
      totalGapMm: 0.4 + t * (3.0 - 0.4),
      freqHz: 1000 + t * (500000 - 1000),
      iBiasA: -1e-9 + t * (2e-9),
    });
    assert.ok(Number.isFinite(r.vOutSteadyV), `bad vout at i=${i}`);
    assert.ok(Number.isFinite(r.caF) && Number.isFinite(r.cbF), `bad caps at i=${i}`);
  }
});

test('doc fixture reproduces center and x=0.1 mm capacitances', () => {
  // Expected values from docs/first_order_calculation.md sections 2.1, 5, and 9.
  const centered = simulate(docFixture({ position: 0.5 }));
  assert.ok(near(centered.caF * 1e12, 48.8, 0.2), `center Ca=${centered.caF * 1e12} pF`);
  assert.ok(near(centered.cbF * 1e12, 48.8, 0.2), `center Cb=${centered.cbF * 1e12} pF`);

  const xMm = 0.1;
  const displaced = simulate(docFixture({
    position: positionFromDisplacementMm(xMm, 1.58),
  }));
  assert.ok(near(displaced.caF * 1e12, 55.8, 0.3), `x=0.1 Ca=${displaced.caF * 1e12} pF`);
  assert.ok(near(displaced.cbF * 1e12, 43.3, 0.3), `x=0.1 Cb=${displaced.cbF * 1e12} pF`);
});

test('doc-like transient (10 cycles) reproduces ~-0.128 V at x=0.1 mm', () => {
  // Expected values from docs/first_order_calculation.md sections 5 and 9.
  const xMm = 0.1;
  const transient = simulateTransientCycles(
    docFixture({ position: positionFromDisplacementMm(xMm, 1.58) }),
    10,
  );
  assert.ok(near(transient.vOutSteadyV, -0.128, 0.006), `vout=${transient.vOutSteadyV}`);

  const sensitivityVPerMm = Math.abs(transient.vOutSteadyV) / xMm;
  assert.ok(
    sensitivityVPerMm >= 1.25 && sensitivityVPerMm <= 1.28,
    `sensitivity=${sensitivityVPerMm} V/mm`,
  );
});

test('doc-like transient slope near center is ~1.25 V/mm', () => {
  // Slope target from docs/first_order_calculation.md section 6.
  const dxMm = 0.001;
  const plus = simulateTransientCycles(
    docFixture({ position: positionFromDisplacementMm(dxMm, 1.58) }),
    10,
  ).vOutSteadyV;
  const minus = simulateTransientCycles(
    docFixture({ position: positionFromDisplacementMm(-dxMm, 1.58) }),
    10,
  ).vOutSteadyV;

  const slopeVPerMm = (plus - minus) / (2 * dxMm);
  assert.ok(near(Math.abs(slopeVPerMm), 1.25, 0.05), `slope=${slopeVPerMm} V/mm`);
  assert.ok(slopeVPerMm < 0, `expected negative slope, got ${slopeVPerMm}`);
});

test('mutual Cc between A/B nodes attenuates but does not collapse doc slope at 130 pF', () => {
  const dxMm = 0.001;
  const plus = simulateTransientCycles(
    docFixture({
      position: positionFromDisplacementMm(dxMm, 1.58),
      ccF: 130e-12,
    }),
    10,
  ).vOutSteadyV;
  const minus = simulateTransientCycles(
    docFixture({
      position: positionFromDisplacementMm(-dxMm, 1.58),
      ccF: 130e-12,
    }),
    10,
  ).vOutSteadyV;

  const slopeVPerMm = Math.abs((plus - minus) / (2 * dxMm));
  assert.ok(slopeVPerMm > 0.48 && slopeVPerMm < 0.55, `slope=${slopeVPerMm} V/mm`);
});

test('no-load steady-state follows doc fixed-point charge-sharing model', () => {
  // With RC-attenuated differential input and C3/C4 sharing, steady-state matches 0.5*DeltaVin.
  const xMm = 0.1;
  const input = docFixture({ position: positionFromDisplacementMm(xMm, 1.58) });
  const transient = simulateTransientCycles(input, 10).vOutSteadyV;
  const steady = simulate(input);

  assert.equal(steady.solverConverged, true);
  assert.ok(near(steady.deltaVinV, -0.255, 0.01), `deltaVin=${steady.deltaVinV}`);

  const expectedSteady = 0.5 * steady.deltaVinV;
  assert.ok(near(steady.vOutSteadyV, expectedSteady, 0.003), `steady=${steady.vOutSteadyV}`);
  assert.ok(near(steady.vOutSteadyV, transient, 0.003), `steady=${steady.vOutSteadyV}, transient=${transient}`);
});
