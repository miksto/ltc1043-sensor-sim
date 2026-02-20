# LTC1043 Capacitive Sensor Readout — First-Order Output Sensitivity Calculation

This document derives a **workable engineering approximation** for the output sensitivity (V/mm) of the LTC1043 switched-capacitor readout shown in the schematic.

It is intentionally written so another LLM (or you) can audit each assumption and reproduce the numbers in code.

---

## 0) What we’re calculating

We want an approximate mapping:

\[
x\ (\text{mm of plate displacement}) \;\;\rightarrow\;\; V_{\text{out}} \ (\text{DC output voltage})
\]

The published text claims:

> “any unbalanced capacitance creates a voltage across the output capacitor of about **1.25 V per mm** of sensor motion.”

We’ll show a first-order model that yields ~**1.26 V/mm**, matching that.

---

## 1) Known parameters (from your system and the excerpt)

### Geometry (per capacitor)
- Plate area:
  \[
  A = 43.5\ \text{cm}^2 = 4.35\times 10^{-3}\ \text{m}^2
  \]
- Center gap:
  \[
  d_0 = 0.79\ \text{mm} = 7.9\times 10^{-4}\ \text{m}
  \]
- Air dielectric approximation:
  \[
  \varepsilon_r \approx 1,\quad \varepsilon_0 = 8.854\times 10^{-12}\ \text{F/m}
  \]

### Drive / clock / circuit values
- Clock frequency:
  \[
  f = 62.5\ \text{kHz},\quad \omega = 2\pi f
  \]
- Clock amplitude (from text): **5 V peak** square wave applied via R10/R11
  \[
  V_{\text{clk}} = 5\ \text{V (peak)}
  \]
- Resistors:
  \[
  R10 = R11 = R = 20\ \text{k}\Omega
  \]
- LTC1043 section A “flying” cap and output hold cap:
  \[
  C_3 = C_4 = 0.0047\ \mu\text{F} = 4.7\ \text{nF}
  \]

---

## 2) Capacitance vs displacement

Model each capacitor as parallel-plate:

\[
C(d) = \frac{\varepsilon_0 A}{d}
\]

Let the moving plate displacement be \(x\), positive toward capacitor **Ca** and away from **Cb**:

\[
d_a = d_0 - x,\quad d_b = d_0 + x
\]

So:

\[
C_a(x)=\frac{\varepsilon_0 A}{d_0-x},\qquad
C_b(x)=\frac{\varepsilon_0 A}{d_0+x}
\]

### 2.1 Capacitance at center
At \(x=0\):

\[
C_0=\frac{\varepsilon_0 A}{d_0}
\]

Numerically:

\[
C_0 = \frac{8.854\times10^{-12}\cdot 4.35\times10^{-3}}{7.9\times10^{-4}}
\approx 4.88\times10^{-11}\ \text{F}
\approx 48.8\ \text{pF}
\]

So at center: **Ca ≈ 48.8 pF**, **Cb ≈ 48.8 pF**.

### 2.2 Small-signal slope at center (per capacitor)

Differentiate \(C=\varepsilon_0A/(d_0\mp x)\):

\[
\left|\frac{dC}{dx}\right|_{x=0}=\frac{\varepsilon_0 A}{d_0^2}
\]

Numerically:

\[
\frac{\varepsilon_0 A}{d_0^2}
= \frac{8.854\times10^{-12}\cdot 4.35\times10^{-3}}{(7.9\times10^{-4})^2}
\approx 6.17\times10^{-8}\ \text{F/m}
\approx 61.7\ \text{pF/mm}
\]

So near center:
- \(dC_a/dx \approx +61.7\ \text{pF/mm}\)
- \(dC_b/dx \approx -61.7\ \text{pF/mm}\)

And the **differential capacitance** slope is doubled:

\[
\frac{d(C_a-C_b)}{dx}\bigg|_{0} \approx 2\cdot 61.7 = 123.4\ \text{pF/mm}
\]

---

## 3) Convert Ca/Cb mismatch into differential clock amplitudes at the LTC1043 input nodes

### 3.1 Simplifying assumption

Each sensor node is driven by a square wave through a resistor into a capacitor to ground:

- Node A: \(V_{\text{clk}}\rightarrow R10 \rightarrow\) node \(\rightarrow C_a \rightarrow \text{GND}\)
- Node B: \(V_{\text{clk}}\rightarrow R11 \rightarrow\) node \(\rightarrow C_b \rightarrow \text{GND}\)

We approximate the **clock component** at each node by the magnitude of a 1st-order low-pass:

\[
V(C) \approx \frac{V_{\text{clk}}}{1+\omega R C}
\]

This is not an exact square-wave transient model; it’s a convenient approximation that matches the published V/mm result well.

So:

\[
V_a \approx \frac{V_{\text{clk}}}{1+\omega R C_a},\quad
V_b \approx \frac{V_{\text{clk}}}{1+\omega R C_b}
\]

and the differential clock seen by the switching section:

\[
\Delta V_{\text{in}} \equiv V_a - V_b
\]

### 3.2 Evaluate common constants

\[
\omega = 2\pi\cdot 62.5\times10^3 \approx 392,699\ \text{rad/s}
\]
\[
R = 20,000\ \Omega
\]

At center \(C_0\approx 48.8\ \text{pF}\):

\[
\omega RC_0 \approx 392,699 \cdot 20,000 \cdot 48.8\times10^{-12}
\approx 0.383
\]

So:

\[
V_0 \approx \frac{5}{1+0.383}\approx 3.61\ \text{V}
\]

---

## 4) Convert differential clock amplitude into DC output voltage (C3/C4 charge transfer)

### 4.1 Key approximation: charge sharing factor

The LTC1043 section A is used like a synchronous demodulator that:
- samples the differential signal onto **C3** in one phase
- transfers (shares) that charge to **C4** in the other phase

A common first-order estimate of the resulting DC step is a charge-sharing ratio:

\[
V_{\text{out}} \approx \alpha \cdot \Delta V_{\text{in}}
\]

where:

\[
\alpha \approx \frac{C_3}{C_3+C_4}
\]

Because in the transfer phase, C3 is effectively paralleled with C4.

With \(C_3 = C_4 = 4.7\ \text{nF}\):

\[
\alpha = \frac{4.7}{4.7+4.7} = 0.5
\]

So, approximately:

\[
V_{\text{out}} \approx 0.5\cdot (V_a - V_b)
\]

---

## 5) Worked example: x = 0.1 mm off-center

Displacement \(x=0.10\ \text{mm}\):

\[
d_a = 0.79-0.10=0.69\ \text{mm},\quad d_b = 0.79+0.10=0.89\ \text{mm}
\]

Capacitances:

\[
C_a = \frac{\varepsilon_0A}{0.69\times10^{-3}} \approx 55.8\ \text{pF}
\]
\[
C_b = \frac{\varepsilon_0A}{0.89\times10^{-3}} \approx 43.3\ \text{pF}
\]

Now compute node amplitudes:

\[
\omega RC_a \approx 392,699\cdot 20,000\cdot 55.8\times10^{-12} \approx 0.438
\Rightarrow
V_a \approx \frac{5}{1.438}=3.48\ \text{V}
\]

\[
\omega RC_b \approx 392,699\cdot 20,000\cdot 43.3\times10^{-12} \approx 0.340
\Rightarrow
V_b \approx \frac{5}{1.340}=3.73\ \text{V}
\]

Differential clock amplitude:

\[
\Delta V_{\text{in}} = V_a - V_b \approx 3.48-3.73 = -0.255\ \text{V}
\]

Output estimate:

\[
V_{\text{out}} \approx 0.5\cdot (-0.255) = -0.128\ \text{V}
\]

So at \(x=0.1\ \text{mm}\), magnitude is \(\approx 128\ \text{mV}\), implying sensitivity:

\[
\frac{|V_{\text{out}}|}{x} \approx \frac{0.128}{0.1} = 1.28\ \text{V/mm}
\]

This is essentially the quoted **~1.25 V/mm**.

---

## 6) Small-signal sensitivity around center (symbolic)

We can derive a compact formula at \(x=0\).

### 6.1 Node amplitude derivative wrt C

Given:

\[
V(C)=\frac{V_{\text{clk}}}{1+\omega RC}
\]

Differentiate:

\[
\frac{dV}{dC} = -\frac{V_{\text{clk}}\ \omega R}{(1+\omega RC)^2}
\]

At center \(C=C_0\):

\[
\left.\frac{dV}{dC}\right|_{C_0}
= -\frac{V_{\text{clk}}\ \omega R}{(1+\omega R C_0)^2}
\]

### 6.2 Differential voltage derivative wrt displacement

Because \(C_a\) increases with \(x\) and \(C_b\) decreases with \(x\), the differential slope doubles:

\[
\frac{d(V_a-V_b)}{dx}\bigg|_0
\approx 2\cdot \left|\frac{dV}{dC}\right|_{C_0}\cdot \left|\frac{dC}{dx}\right|_0
\]

Finally apply the charge-sharing factor \(\alpha\):

\[
\boxed{
\frac{dV_{\text{out}}}{dx}\bigg|_0
\approx
\alpha \cdot 2\cdot \left|\frac{dV}{dC}\right|_{C_0}\cdot \left|\frac{dC}{dx}\right|_0
}
\]

Plugging:

- \(\alpha=0.5\)
- \(\left|\frac{dC}{dx}\right|_0 \approx 61.7\ \text{pF/mm}\)
- \(C_0\approx 48.8\ \text{pF}\)
- \(V_{\text{clk}}=5\ \text{V}\)
- \(\omega=392,699\ \text{rad/s}\)
- \(R=20\ \text{k}\Omega\)

gives about:

\[
\left|\frac{dV_{\text{out}}}{dx}\right|_0 \approx 1.26\ \text{V/mm}
\]

---

## 7) Notes / assumptions to validate in a more exact model

This approximation will match the “headline” sensitivity but ignores second-order effects:

1. **Square-wave transient vs frequency-domain amplitude**  
   We used \(V(C)=V_{\text{clk}}/(1+\omega RC)\) rather than integrating RC charge steps explicitly.

2. **LTC1043 switch resistance / non-overlap timing**  
   Real charge transfer per cycle depends on switch R\_ON, timing, and any internal charge balancing.

3. **Stray capacitance Cc (~130 pF)**  
   Cc affects common-mode, feedthrough, and sometimes effective drive; it may change sensitivity slightly.

4. **Fringing fields / non-ideal plate geometry**  
   The parallel-plate formula is first order; fringing increases C and changes dC/dx slightly.

5. **Output loading / following stage**  
   If Vout is loaded significantly, the effective \(\alpha\) changes.

---

## 8) Minimal algorithm for code

Given displacement \(x\) in meters (or mm):

1. Compute:
   \[
   C_a=\frac{\varepsilon_0A}{d_0-x},\quad
   C_b=\frac{\varepsilon_0A}{d_0+x}
   \]
2. Compute:
   \[
   V_a=\frac{V_{\text{clk}}}{1+\omega RC_a},\quad
   V_b=\frac{V_{\text{clk}}}{1+\omega RC_b}
   \]
3. Compute:
   \[
   \alpha = \frac{C_3}{C_3+C_4}
   \]
4. Output:
   \[
   V_{\text{out}} = \alpha (V_a - V_b)
   \]

---

## 9) Quick sanity check values

At center:
- \(C_a=C_b\approx 48.8\ \text{pF}\) → \(V_a=V_b\) → \(V_{\text{out}}\approx 0\)

At \(x=0.1\ \text{mm}\):
- \(C_a\approx 55.8\ \text{pF}\), \(C_b\approx 43.3\ \text{pF}\)
- \(\Delta V_{\text{in}}\approx -0.255\ \text{V}\)
- \(V_{\text{out}}\approx -0.128\ \text{V}\)

So: \(|V_{\text{out}}|/x\approx 1.28\ \text{V/mm}\)

---