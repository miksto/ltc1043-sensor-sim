import { DEFAULT_SOLVER } from './defaults.mjs';

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function assertFiniteNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function assertBoolean(name, value) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
}

function assertPositive(name, value) {
  if (value <= 0) {
    throw new RangeError(`${name} must be > 0`);
  }
}

function assertNonNegative(name, value) {
  if (value < 0) {
    throw new RangeError(`${name} must be >= 0`);
  }
}

function validateClampBounds(minV, maxV, minName, maxName) {
  assertFiniteNumber(minName, minV);
  assertFiniteNumber(maxName, maxV);
  if (minV > maxV) {
    throw new RangeError(`${minName} must be <= ${maxName}`);
  }
}

function validateState(state, name = 'state') {
  if (!state || typeof state !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
  assertFiniteNumber(`${name}.v3`, state.v3);
  assertFiniteNumber(`${name}.v4`, state.v4);
}

function validateDerived(derived) {
  if (!derived || typeof derived !== 'object') {
    throw new TypeError('derived must be an object');
  }
  assertFiniteNumber('derived.c3F', derived.c3F);
  assertFiniteNumber('derived.c4F', derived.c4F);
  assertFiniteNumber('derived.c3SampleV', derived.c3SampleV);
  assertFiniteNumber(
    'derived.deltaVBiasPerCycleV',
    derived.deltaVBiasPerCycleV,
  );
  assertFiniteNumber('derived.transferGain', derived.transferGain);
  assertBoolean('derived.useClamp', derived.useClamp);
  assertPositive('derived.c3F', derived.c3F);
  assertPositive('derived.c4F', derived.c4F);
  validateClampBounds(
    derived.clampMinV,
    derived.clampMaxV,
    'derived.clampMinV',
    'derived.clampMaxV',
  );
}

function normalizeSolver(solver) {
  if (!solver || typeof solver !== 'object') {
    throw new TypeError('solver must be an object');
  }

  const normalized = {
    tolV: solver.tolV,
    maxIter: solver.maxIter,
    transferGain: solver.transferGain,
    useOutputClamp: solver.useOutputClamp,
    clampMinV: solver.clampMinV,
    clampMaxV: solver.clampMaxV,
    collectTrace: solver.collectTrace,
  };

  assertFiniteNumber('solver.tolV', normalized.tolV);
  assertNonNegative('solver.tolV', normalized.tolV);
  assertFiniteNumber('solver.maxIter', normalized.maxIter);
  if (!Number.isInteger(normalized.maxIter) || normalized.maxIter < 1) {
    throw new RangeError('solver.maxIter must be an integer >= 1');
  }
  assertFiniteNumber('solver.transferGain', normalized.transferGain);
  assertBoolean('solver.useOutputClamp', normalized.useOutputClamp);
  assertBoolean('solver.collectTrace', normalized.collectTrace);
  validateClampBounds(
    normalized.clampMinV,
    normalized.clampMaxV,
    'solver.clampMinV',
    'solver.clampMaxV',
  );

  return normalized;
}

function normalizeDerivedForSolver(derived, solver) {
  if (!derived || typeof derived !== 'object') {
    throw new TypeError('derived must be an object');
  }

  const normalized = {
    c3F: derived.c3F,
    c4F: derived.c4F,
    c3SampleV: derived.c3SampleV,
    deltaVBiasPerCycleV: derived.deltaVBiasPerCycleV,
    transferGain: solver.transferGain,
    useClamp: solver.useOutputClamp,
    clampMinV: solver.clampMinV,
    clampMaxV: solver.clampMaxV,
  };
  validateDerived(normalized);
  return normalized;
}

export function cycleStep(state, derived) {
  validateState(state);
  validateDerived(derived);

  const {
    c3F,
    c4F,
    c3SampleV,
    deltaVBiasPerCycleV,
    transferGain,
    useClamp,
    clampMinV,
    clampMaxV,
  } = derived;

  const sampledC3VoltageV = c3SampleV;
  const outputCapVoltageBeforeV = state.v4;
  const chargeSharingRatio = c3F / Math.max(c3F + c4F, 1e-18);
  const effectiveC3DriveV = chargeSharingRatio * sampledC3VoltageV;

  const transferEqCapF = (c3F * c4F) / Math.max(c3F + c4F, 1e-18);
  const qTransferC =
    transferGain *
    transferEqCapF *
    (effectiveC3DriveV - outputCapVoltageBeforeV);
  const c3VoltageAfterShareV = effectiveC3DriveV - qTransferC / c3F;
  let outputCapVoltageAfterV = outputCapVoltageBeforeV + qTransferC / c4F;
  outputCapVoltageAfterV -= deltaVBiasPerCycleV;
  const qSensorC = c3F * sampledC3VoltageV;

  if (useClamp) {
    outputCapVoltageAfterV = clamp(
      outputCapVoltageAfterV,
      clampMinV,
      clampMaxV,
    );
  }

  return {
    state: { v3: c3VoltageAfterShareV, v4: outputCapVoltageAfterV },
    qSensorC,
    qTransferC,
  };
}

export function solvePeriodicSteadyState(
  derived,
  initialState = null,
  solver = DEFAULT_SOLVER,
) {
  const normalizedSolver = normalizeSolver(solver);
  if (initialState !== null) {
    validateState(initialState, 'initialState');
  }
  const normalizedDerived = normalizeDerivedForSolver(
    derived,
    normalizedSolver,
  );

  const closedForm = solveClosedFormSteadyState(
    normalizedDerived,
    initialState,
    normalizedSolver,
  );
  if (closedForm) {
    if (normalizedSolver.collectTrace) {
      const traceSampled = sampleTransientTrace(
        normalizedDerived,
        initialState,
        normalizedSolver,
        closedForm.state,
      );
      return {
        ...closedForm,
        iterations: traceSampled.iterations,
        residualV: traceSampled.residualV,
        trace: traceSampled.trace,
      };
    }
    return closedForm;
  }
  return solvePeriodicSteadyStateIterative(
    normalizedDerived,
    initialState,
    normalizedSolver,
  );
}

function solveClosedFormSteadyState(derived, initialState, solver) {
  const { c3F, c4F, c3SampleV, deltaVBiasPerCycleV } = derived;

  const transferGain = solver.transferGain;
  const cSum = c3F + c4F;
  if (!Number.isFinite(cSum) || cSum <= 0) return null;

  const shareRatio = c3F / cSum;
  const v3Drive = shareRatio * c3SampleV;
  const k = transferGain * shareRatio;
  const a = 1 - k;
  const b = k * v3Drive - deltaVBiasPerCycleV;
  const denom = 1 - a;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-18) return null;

  let v4Steady = b / denom;
  if (!Number.isFinite(v4Steady)) return null;
  if (solver.useOutputClamp) {
    v4Steady = clamp(v4Steady, solver.clampMinV, solver.clampMaxV);
  }

  const mapped = applyAffineMap(v4Steady, a, b, solver);
  if (!Number.isFinite(mapped) || Math.abs(mapped - v4Steady) > 1e-10)
    return null;

  const cEqF = (c3F * c4F) / Math.max(cSum, 1e-18);
  const qTransferC = transferGain * cEqF * (v3Drive - v4Steady);
  const v3Steady = v3Drive - qTransferC / Math.max(c3F, 1e-18);
  const qSensorC = c3F * c3SampleV;

  const state = { v3: v3Steady, v4: v4Steady };
  const trace = solver.collectTrace
    ? [{ iteration: 1, v3: state.v3, v4: state.v4, residualV: 0 }]
    : null;

  return {
    converged: true,
    iterations: 1,
    residualV: 0,
    state,
    qSensorC,
    qTransferC,
    trace,
  };
}

function applyAffineMap(v4, a, b, solver) {
  let v4Next = a * v4 + b;
  if (solver.useOutputClamp) {
    v4Next = clamp(v4Next, solver.clampMinV, solver.clampMaxV);
  }
  return v4Next;
}

function sampleTransientTrace(derived, initialState, solver, targetState) {
  const trace = [];
  const maxTraceIterations = Math.max(1, Math.min(solver.maxIter, 10000));
  const minTraceIterations = 10;
  const absTol = Math.max(solver.tolV, 1e-12);
  const relTol = 1e-3;
  let state = initialState
    ? { v3: initialState.v3, v4: initialState.v4 }
    : { v3: 0, v4: 0 };
  let residualV = Infinity;

  for (let i = 0; i < maxTraceIterations; i++) {
    const prevV3 = state.v3;
    const prevV4 = state.v4;
    const step = cycleStep(state, derived);
    state = step.state;
    residualV = Math.max(
      Math.abs(state.v3 - prevV3),
      Math.abs(state.v4 - prevV4),
    );
    trace.push({
      iteration: i + 1,
      v3: state.v3,
      v4: state.v4,
      residualV,
    });

    if (targetState && i + 1 >= minTraceIterations) {
      const scaleV4 = Math.max(Math.abs(targetState.v4), 1e-6);
      const closeEnoughV4 =
        Math.abs(state.v4 - targetState.v4) <=
        Math.max(absTol, relTol * scaleV4);
      if (closeEnoughV4) {
        break;
      }
    }
  }

  return {
    iterations: trace.length,
    residualV,
    trace,
  };
}

function solvePeriodicSteadyStateIterative(
  derived,
  initialState = null,
  solver = DEFAULT_SOLVER,
) {
  let state = initialState
    ? { v3: initialState.v3, v4: initialState.v4 }
    : { v3: 0, v4: 0 };

  let residualV = Infinity;
  let iterations = 0;
  let qSensorC = 0;
  let qTransferC = 0;
  const trace = solver.collectTrace ? [] : null;

  for (let i = 0; i < solver.maxIter; i++) {
    const prevV3 = state.v3;
    const prevV4 = state.v4;
    const step = cycleStep(state, derived);
    state = step.state;
    qSensorC = step.qSensorC;
    qTransferC = step.qTransferC;
    residualV = Math.max(
      Math.abs(state.v3 - prevV3),
      Math.abs(state.v4 - prevV4),
    );
    iterations = i + 1;
    if (trace) {
      trace.push({
        iteration: iterations,
        v3: state.v3,
        v4: state.v4,
        residualV,
      });
    }

    if (residualV < solver.tolV) {
      return {
        converged: true,
        iterations,
        residualV,
        state,
        qSensorC,
        qTransferC,
        trace,
      };
    }
  }

  return {
    converged: false,
    iterations,
    residualV,
    state,
    qSensorC,
    qTransferC,
    trace,
  };
}
