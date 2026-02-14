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

test('output remains bounded for very large R_eq due to equilibrium/clamp', () => {
  const r = simulate({ ...DEFAULT_INPUTS, position: 0.6, rEqOhm: 1e9 });
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
      rEqOhm: 1e3 + t * (1e7 - 1e3),
    });
    assert.ok(Number.isFinite(r.vOutSteadyV), `bad vout at i=${i}`);
    assert.ok(Number.isFinite(r.caF) && Number.isFinite(r.cbF), `bad caps at i=${i}`);
  }
});
