import {
  escapeHtml,
  fmtCap,
  fmtCharge,
  fmtCurrent,
  fmtHz,
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
        ["Va node (RC atten.)", fmtVolt(res.vaNodeV)],
        ["Vb node (RC atten.)", fmtVolt(res.vbNodeV)],
        ["ΔVin = Va - Vb", fmtVolt(res.deltaVinV)],
        ["Q_sample on C3", fmtCharge(res.qPacketC)],
        ["Q_transfer/cycle (signed)", fmtCharge(res.qToC4C)],
        ["Op-amp input bias", fmtCurrent(res.iBiasA)],
        ["ΔV_bias/cycle on C4", fmtVolt(res.deltaVBiasPerCycleV)],
        ["V3 steady (internal)", fmtVolt(res.v3SteadyV)],
      ],
    },
    {
      title: "Output And Timing",
      items: [
        ["Vout steady", fmtVolt(res.vOutSteadyV)],
        ["τA = R10·(Ca+Cc)", fmtSec(res.tauAS)],
        ["τB = R11·(Cb+Cc)", fmtSec(res.tauBS)],
        ["f_max for full-charge (5τ rule)", fmtHz(res.fWarningThresholdHz)],
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
  const docInputs = {
    ...baseInputs,
    widthCm: sideCm,
    heightCm: sideCm,
    totalGapMm: 1.58,
    minGapMm: 0.05,
    freqHz: 62500,
    vDrivePeakV: 5,
    r10Ohm: 20000,
    r11Ohm: 20000,
    c3F: 4.7e-9,
    c4F: 4.7e-9,
    ccF: 0,
    epsilonR: 1,
    iBiasA: 50e-12,
  };

  const centeredDoc = simulate({
    ...docInputs,
    position: 0.5,
  });

  function slopeAtCenter(inputs) {
    const p0 = 0.5;
    const dp = 1e-4;
    const left = simulate({
      ...inputs,
      position: p0 - dp,
    }).vOutSteadyV;
    const right = simulate({
      ...inputs,
      position: p0 + dp,
    }).vOutSteadyV;
    const dxMm = 2 * dp * inputs.totalGapMm;
    return (right - left) / Math.max(dxMm, 1e-15);
  }

  const slopeDocVPerMm = slopeAtCenter(docInputs);
  const slopeCurrentVPerMm = slopeAtCenter(baseInputs);

  const rows = [
    {
      k: "Centered capacitance (doc fixture)",
      c: `${(centeredDoc.caF * 1e12).toFixed(3)} pF`,
      r: `${ref.centeredCapPF.toFixed(1)} pF (${pctDelta(centeredDoc.caF * 1e12, ref.centeredCapPF)})`,
    },
    {
      k: "Local slope dVout/dx (doc fixture)",
      c: `${slopeDocVPerMm.toFixed(4)} V/mm`,
      r: `${ref.slopeVPerMm.toFixed(2)} V/mm (${pctDelta(slopeDocVPerMm, ref.slopeVPerMm)})`,
    },
    {
      k: "Local slope dVout/dx (current inputs)",
      c: `${slopeCurrentVPerMm.toFixed(4)} V/mm`,
      r: "n/a (depends on current parameter values)",
    },
  ];

  validationRowsEl.innerHTML = rows.map((row) => `
    <div class="row">
      <div>${escapeHtml(row.k)}</div>
      <div>${escapeHtml(row.c)}</div>
      <div>${escapeHtml(row.r)}</div>
    </div>`).join("");
}
