import assert from "node:assert/strict";

export function nearAbs(actual, expected, absTol, label = "value") {
  assert.ok(
    Math.abs(actual - expected) <= absTol,
    `${label}: expected ${expected} ±${absTol}, got ${actual}`,
  );
}

export function nearRel(actual, expected, relTol, absTol = 0, label = "value") {
  const scale = Math.max(Math.abs(expected), 1);
  const tol = Math.max(absTol, relTol * scale);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected} within rel=${relTol} abs=${absTol}, got ${actual}`,
  );
}

export function runCases(cases, fn) {
  for (const c of cases) {
    fn(c);
  }
}
