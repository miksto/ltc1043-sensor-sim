# LTC1043 Sensor Simulator

Single-page simulator for a capacitive displacement sensor front-end using an LTC1043-style switched-cap topology.

## Source Circuit References
- Main page: <https://www.groundmotion.org/main.html>
- Board/circuit PDF: <https://www.groundmotion.org/Yuma2.pdf>

## What This Simulates
- Sensor geometry to capacitance (`Ca`, `Cb`) from physical dimensions.
- Switched-cap charge transfer between sensor, `C3`, and `C4`.
- Output behavior with leakage through configurable `R_out_load`.
- Frequency, position, and gap sweeps with live charts.
- Solver convergence diagnostics (iteration trace + residual chart).

## Scope and Assumptions
- Front-end only (not the full analog feedback loop/integrator/coil plant).
- Ideal parallel-plate capacitance model (`C = ε0 εr A / d`).
- No fringing-field or plate-thickness corrections.
- Full-charge assumption is checked and warned when invalid by the 5τ rule.

## Tech Stack
- Vanilla HTML/CSS/JS
- Vite for local dev/build
- Node.js `24.x`
- Firebase Hosting

## Getting Started
```bash
nvm use
npm ci
npm run dev
```

App will run on the local Vite dev server URL shown in terminal.

## Commands
```bash
npm run dev      # local dev server
npm test         # unit tests (node:test)
npm run build    # production build to dist/
npm run preview  # serve built dist/ locally
npm run check    # test + build
```

## Project Structure
```text
index.html                  # UI + chart rendering
src/simulator-core.mjs      # simulation/math core
test/simulator-core.test.mjs
firebase.json               # hosting config (public = dist)
.github/workflows/          # Firebase Hosting PR/live deploy workflows
```

## Deploy
- Firebase project: `ltc1043-sensor-sim`
- Live URL: <https://ltc1043-sensor-sim.web.app>

Manual deploy:
```bash
npm run build
firebase deploy --only hosting --project ltc1043-sensor-sim
```

CI/CD deploy:
- PRs to `main`: preview deploy via `.github/workflows/firebase-hosting-pull-request.yml`
- Push to `main`: live deploy via `.github/workflows/firebase-hosting-merge.yml`
