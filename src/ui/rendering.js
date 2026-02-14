import {
  escapeHtml,
  fmtCap,
  fmtCharge,
  fmtHz,
  fmtOhm,
  fmtSec,
  fmtVolt,
  pctDelta,
} from "./format.js";

export function renderMetrics(metricsEl, warningsEl, res) {
  const sections = [
    {
      title: "Sensor Geometry",
      items: [
        ["Left gap dL", `${(res.dLeftM * 1e3).toFixed(4)} mm`],
        ["Right gap dR", `${(res.dRightM * 1e3).toFixed(4)} mm`],
        ["Ca", fmtCap(res.caF)],
        ["Cb", fmtCap(res.cbF)],
        ["ΔC = Ca-Cb", fmtCap(res.deltaCF)],
      ],
    },
    {
      title: "Charge Transfer",
      items: [
        ["Q_packet (open-loop)", fmtCharge(res.qPacketC)],
        ["Q_transfer/cycle (signed)", fmtCharge(res.qToC4C)],
        ["V3 steady (internal)", fmtVolt(res.v3SteadyV)],
        ["α", res.alpha.toFixed(6)],
      ],
    },
    {
      title: "Output And Timing",
      items: [
        ["Vout steady", fmtVolt(res.vOutSteadyV)],
        ["Output pole f", fmtHz(res.fPoleHz)],
        ["τ_out", fmtSec(res.tauOutS)],
        ["τA = R10·(Ca+Cc)", fmtSec(res.tauAS)],
        ["τB = R11·(Cb+Cc)", fmtSec(res.tauBS)],
        ["f_max for full-charge (5τ rule)", fmtHz(res.fWarningThresholdHz)],
        ["R_eq (used)", fmtOhm(res.rEqOhm)],
      ],
    },
    {
      title: "Solver Diagnostics",
      items: [
        ["Solver iterations", String(res.solverIterations)],
        ["Solver residual", fmtVolt(res.solverResidualV)],
        ["Solver converged", res.solverConverged ? "yes" : "no", res.solverConverged ? "good" : "bad"],
      ],
    },
  ];

  metricsEl.innerHTML = `<div class="metrics-sections">${
    sections.map((section) => `
      <section class="metric-section">
        <h3>${escapeHtml(section.title)}</h3>
        <div class="metrics-grid">
          ${section.items.map((item) => `
            <div class="metric">
              <div class="k">${escapeHtml(item[0])}</div>
              <div class="v ${item[2] || ""}">${escapeHtml(item[1])}</div>
            </div>`).join("")}
        </div>
      </section>`).join("")
  }</div>`;

  if (res.warnings.length > 0) {
    warningsEl.innerHTML = `<div class="warn">${escapeHtml(res.warnings.join(" "))}</div>`;
  } else {
    warningsEl.innerHTML = `<div class="ok">Full-charge assumption check: OK at current frequency.</div>`;
  }
}

export function renderValidation(validationRowsEl, simulate, baseInputs, ref) {
  const sideCm = Math.sqrt(43.5);
  const centered = simulate({
    ...baseInputs,
    position: 0.5,
    freqHz: 62500,
    totalGapMm: 1.58,
    widthCm: sideCm,
    heightCm: sideCm,
  });

  const p0 = 0.5;
  const dp = 1e-4;
  const left = simulate({
    ...baseInputs,
    position: p0 - dp,
    freqHz: 62500,
    totalGapMm: 1.58,
    widthCm: sideCm,
    heightCm: sideCm,
  }).vOutSteadyV;

  const right = simulate({
    ...baseInputs,
    position: p0 + dp,
    freqHz: 62500,
    totalGapMm: 1.58,
    widthCm: sideCm,
    heightCm: sideCm,
  }).vOutSteadyV;

  const dxMm = 2 * dp * 1.58;
  const slopeVPerMm = (right - left) / Math.max(dxMm, 1e-15);

  const rows = [
    {
      k: "Centered capacitance (each)",
      c: `${(centered.caF * 1e12).toFixed(3)} pF`,
      r: `${ref.centeredCapPF.toFixed(1)} pF (${pctDelta(centered.caF * 1e12, ref.centeredCapPF)})`,
    },
    {
      k: "Local slope dVout/dx near p=0.5",
      c: `${slopeVPerMm.toFixed(4)} V/mm`,
      r: `${ref.slopeVPerMm.toFixed(2)} V/mm (${pctDelta(slopeVPerMm, ref.slopeVPerMm)})`,
    },
    {
      k: "Output pole",
      c: `${centered.fPoleHz.toFixed(3)} Hz`,
      r: `${ref.poleHz.toFixed(0)} Hz (${pctDelta(centered.fPoleHz, ref.poleHz)})`,
    },
  ];

  validationRowsEl.innerHTML = rows.map((row) => `
    <div class="row">
      <div>${escapeHtml(row.k)}</div>
      <div>${escapeHtml(row.c)}</div>
      <div>${escapeHtml(row.r)}</div>
    </div>`).join("");
}
