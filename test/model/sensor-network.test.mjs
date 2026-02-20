import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INPUTS } from "../../src/model/defaults.mjs";
import {
  simulateSensorNodeWaveform,
  solveSensorNodeVoltages,
} from "../../src/model/sensor-network.mjs";
import { nearAbs, nearRel, runCases } from "../helpers/assertions.mjs";

test("solveSensorNodeVoltages gives Va≈Vb for symmetric network", () => {
  const out = solveSensorNodeVoltages({
    vDrivePeakV: 5,
    r10Ohm: 20000,
    r11Ohm: 20000,
    caF: 50e-12,
    cbF: 50e-12,
    ccF: 50e-12,
    omega: 2 * Math.PI * 62500,
  });
  nearAbs(out.vaNodeV, out.vbNodeV, 1e-12, "Va/Vb symmetry");
});

test("solveSensorNodeVoltages approaches source at omega->0", () => {
  const out = solveSensorNodeVoltages({
    vDrivePeakV: 5,
    r10Ohm: 20000,
    r11Ohm: 20000,
    caF: 48e-12,
    cbF: 53e-12,
    ccF: 10e-12,
    omega: 0,
  });
  nearAbs(out.vaNodeV, 5, 1e-12, "Va at omega=0");
  nearAbs(out.vbNodeV, 5, 1e-12, "Vb at omega=0");
});

test("solveSensorNodeVoltages attenuates with high omega and stays finite", () => {
  const low = solveSensorNodeVoltages({
    vDrivePeakV: 5,
    r10Ohm: 20000,
    r11Ohm: 20000,
    caF: 48e-12,
    cbF: 53e-12,
    ccF: 10e-12,
    omega: 2 * Math.PI * 1000,
  });
  const high = solveSensorNodeVoltages({
    vDrivePeakV: 5,
    r10Ohm: 20000,
    r11Ohm: 20000,
    caF: 48e-12,
    cbF: 53e-12,
    ccF: 10e-12,
    omega: 2 * Math.PI * 5_000_000,
  });
  assert.ok(Math.abs(high.vaNodeV) < Math.abs(low.vaNodeV));
  assert.ok(Math.abs(high.vbNodeV) < Math.abs(low.vbNodeV));
  assert.ok(Number.isFinite(high.vaNodeV));
  assert.ok(Number.isFinite(high.vbNodeV));
});

test("solveSensorNodeVoltages uses fallback when matrix determinant is tiny", () => {
  const input = {
    vDrivePeakV: 1.23,
    r10Ohm: 1e18,
    r11Ohm: 1e18,
    caF: 40e-12,
    cbF: 60e-12,
    ccF: 0,
    omega: 0,
  };
  const out = solveSensorNodeVoltages(input);
  nearAbs(out.vaNodeV, 1.23, 1e-12, "fallback Va");
  nearAbs(out.vbNodeV, 1.23, 1e-12, "fallback Vb");
});

test("simulateSensorNodeWaveform returns one cycle with expected sample counts", () => {
  const wave = simulateSensorNodeWaveform(
    { ...DEFAULT_INPUTS, position: 0.52, ccF: 40e-12 },
    { pointsPerCycle: 120, warmupCycles: 4 },
  );
  const expectedStepsPerHalf = Math.max(40, Math.floor(120 / 2));
  const expectedLength = 1 + (2 * expectedStepsPerHalf);

  assert.equal(wave.tS.length, expectedLength);
  assert.equal(wave.vaNodeV.length, expectedLength);
  assert.equal(wave.vbNodeV.length, expectedLength);
  nearRel(wave.tS.at(-1), wave.periodS, 1e-12, 0, "waveform end time");
});

test("solveSensorNodeVoltages throws TypeError for non-finite inputs", () => {
  runCases([
    { key: "vDrivePeakV", value: Number.NaN },
    { key: "r10Ohm", value: Number.POSITIVE_INFINITY },
    { key: "r11Ohm", value: Number.NaN },
    { key: "caF", value: Number.NEGATIVE_INFINITY },
    { key: "cbF", value: Number.NaN },
    { key: "ccF", value: Number.NaN },
    { key: "omega", value: Number.NaN },
  ], ({ key, value }) => {
    assert.throws(
      () => solveSensorNodeVoltages({
        vDrivePeakV: 5,
        r10Ohm: 20000,
        r11Ohm: 20000,
        caF: 48e-12,
        cbF: 53e-12,
        ccF: 10e-12,
        omega: 2 * Math.PI * 62500,
        [key]: value,
      }),
      TypeError,
      `expected TypeError for ${key}`,
    );
  });
});

test("solveSensorNodeVoltages throws RangeError for invalid ranges", () => {
  runCases([
    { key: "r10Ohm", value: 0 },
    { key: "r11Ohm", value: -1 },
    { key: "caF", value: -1e-12 },
    { key: "cbF", value: -1e-12 },
    { key: "ccF", value: -1e-12 },
    { key: "omega", value: -1 },
  ], ({ key, value }) => {
    assert.throws(
      () => solveSensorNodeVoltages({
        vDrivePeakV: 5,
        r10Ohm: 20000,
        r11Ohm: 20000,
        caF: 48e-12,
        cbF: 53e-12,
        ccF: 10e-12,
        omega: 2 * Math.PI * 62500,
        [key]: value,
      }),
      RangeError,
      `expected RangeError for ${key}`,
    );
  });
});
