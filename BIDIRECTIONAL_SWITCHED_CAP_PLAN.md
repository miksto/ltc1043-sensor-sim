# Plan: Upgrade to Bidirectional Switched-Cap Transfer Model

## Objective
Replace the current one-way charge-packet approximation with a two-phase switched-cap model that supports forward and reverse charge transfer, then solves for steady-state output per operating point.

This is intended to make `Vout` and `dVout/dx` expectations more realistic at high `R_eq`, high `Vout`, and near saturation.

## Scope
- In scope:
  - Front-end only (Ca, Cb, Cc, R10, R11, C3, C4, switch phases, output load `R_eq`)
  - Bidirectional charge transfer between C3 and C4 through phase switching
  - Steady-state solver over repeated cycles
  - Optional output clamp/leak non-idealities
- Out of scope:
  - Full seismometer loop (U1A, integrator/coil dynamics)
  - Detailed transistor-level LTC1043 internals

## Model Requirements
1. Preserve existing geometry-driven capacitance calculation for `Ca` and `Cb`.
2. Model two non-overlapping switching phases per cycle.
3. Track node voltages and capacitor charges across each phase.
4. Allow reverse transfer when voltage conditions favor charge flowing from `C4` back toward transfer nodes.
5. Include output leakage path through user-defined `R_eq`.
6. Compute periodic steady state (cycle-to-cycle convergence).

## Circuit Abstraction
Use a discrete-time state model with state vector at start of cycle:
- `V3`: voltage on C3
- `V4`: voltage on C4 (`Vout`)
- Optional internal node states if needed after first implementation (`VA`, `VB` equivalent sampled nodes)

Per cycle:
- Phase A (clock high): solve charge redistribution and source injection from switched nodes.
- Phase B (clock low): solve second redistribution including transfer toward/from C4.
- Leakage step: apply `R_eq` decay on `V4` over full cycle duration.

Implementation should enforce charge conservation at each switching event.

## Numerical Method
1. For a given input point (`freq`, geometry, components):
   - Initialize state near previous solution (for sweeps) or zero.
   - Iterate cycle map `x[n+1] = F(x[n])` until convergence:
     - convergence criteria: max absolute delta in state < `1e-9 V` (configurable)
     - max iterations: e.g. 20k cycles (fail with warning if not converged)
2. Extract steady-state metrics:
   - `Vout_steady` = converged `V4`
   - ripple estimate: max-min `V4` over one cycle (optional metric)
   - local slope `dVout/dx` from finite difference around position

## Non-Idealities (Phase 2 after core solver)
Add optional toggles/inputs:
- `Vout_min`, `Vout_max` hard clamp (default ±5 V or user-selected rails)
- `R_leak_floor` extra leakage path to avoid unbounded edge cases
- optional effective switch resistance per phase (`Rsw`) for finite transfer speed

## UI/UX Changes
1. Add model mode indicator:
   - `Bidirectional switched-cap (steady-state)`
2. Add solver diagnostics panel:
   - converged / not converged
   - iterations used
   - residual error
3. Keep existing plots and metrics, but update descriptions to reflect steady-state cycle solution.
4. Keep existing validation section; add note that absolute match depends on non-ideal parameters.

## Code Structure Changes (`index.html`)
1. Create dedicated simulation sections in JS:
   - `computeGeometryCaps(inputs)`
   - `cycleStep(state, inputs)`
   - `solvePeriodicSteadyState(inputs, initialState)`
   - `simulateBidirectional(inputs)`
2. Replace current `simulate()` internals with call to bidirectional solver.
3. Cache previous steady-state per sweep to accelerate neighboring points.
4. Ensure deterministic results for same input set.

## Validation and Test Plan
## A. Regression/consistency
- Centered case (`p=0.5`) gives near-zero differential drive and small `Vout`.
- Sign convention remains: increasing `p` gives positive output direction.

## B. Physical behavior
- Increasing `R_eq` no longer causes unrealistic unbounded growth; output approaches bounded equilibrium (and clamp if enabled).
- Reverse transfer is observed in diagnostics when `V4` is high enough.
- High-frequency conditions produce expected reduced settling and/or warnings.

## C. Numerical robustness
- No NaN/Infinity over full sweep ranges.
- Convergence achieved for standard defaults.
- Non-convergent points produce warning and fallback handling.

## D. Practical calibration readiness
- Add one-point and two-point calibration hooks (future-ready):
  - fit effective transfer factor / leakage to measured lab data
  - re-run sweeps with fitted parameters

## Rollout Steps
1. Implement core cycle map and steady-state solver behind feature flag in code.
2. Compare old vs new outputs on same inputs; record differences.
3. Promote new model as default once convergence and stability checks pass.
4. Add optional non-ideal controls (clamp/leak/switch resistance).
5. Document interpretation limits and calibration workflow.

## Acceptance Criteria
- Simulator produces bounded, converged `Vout` for default setup.
- `dVout/dx` trend remains smooth across position sweep.
- High `R_eq` behavior is physically plausible (no artificial runaway).
- Charts remain interactive with acceptable performance (<150 ms per typical update on default sweep density).
- Clear warnings when solver fails to converge.

## Open Decisions
1. Whether to include output rail clamps by default or as optional advanced settings.
2. Whether to expose switch resistance (`Rsw`) as a user input.
3. Target convergence tolerance and max-iteration defaults for UI responsiveness.
