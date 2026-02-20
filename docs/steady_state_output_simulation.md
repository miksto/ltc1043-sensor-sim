# Debug Note: Why a Cycle-by-Cycle LTC1043 Charge-Sharing Simulator Can Overpredict Vout

## 0) Symptom

You simulated the LTC1043 capacitive sensor readout over many switching cycles and obtained:

- **Vout ≈ 547.72 mV** for **x = 0.1 mm** displacement
- ⇒ **≈ 5.48 V/mm**

But the application note / text expects roughly:

- **≈ 125 mV** for **x = 0.1 mm**
- ⇒ **≈ 1.25 V/mm**

That’s a factor of about:

\[
\frac{5.48}{1.25}\approx 4.38\times
\]

This document provides a minimal discrete-time model that should converge close to the app note value and lists common failure modes that produce ~4× overshoot.

---

## 1) Key behavioral requirement: Vout must converge (not integrate upward)

This topology is **not** a one-way charge pump that adds a fixed charge to C4 each cycle.

Instead, it is closer to:

1. sample a differential voltage onto C3
2. connect C3 to C4 → **charge sharing**
3. repeat → **finite steady-state** is reached

If the model effectively does:

\[
V*{\text{out}}[n+1] = V*{\text{out}}[n] + \Delta V
\]

(or any equivalent “always add charge” formulation), it will **overpredict**, often by large factors.

---

## 2) Minimal discrete-time model that should match ~1.25 V/mm

### 2.1 Capacitances vs displacement

Use parallel-plate (air gap):

\[
C_a(x)=\frac{\varepsilon_0 A}{d_0-x},\qquad
C_b(x)=\frac{\varepsilon_0 A}{d_0+x}
\]

Given (from your system / note):

- \(A = 43.5\ \text{cm}^2 = 4.35\times10^{-3}\ \text{m}^2\)
- \(d_0 = 0.79\ \text{mm} = 7.9\times10^{-4}\ \text{m}\)
- \(\varepsilon_0 = 8.854\times10^{-12}\ \text{F/m}\)

At \(x=0.1\ \text{mm}\):

- \(d_a=0.69\text{ mm},\ d_b=0.89\text{ mm}\)
- \(C_a\approx 55.8\text{ pF}\)
- \(C_b\approx 43.3\text{ pF}\)

(These are “exact” from the formula; they are not linearized.)

---

### 2.2 The sensor RC nodes do NOT swing full clock amplitude

The app note says U7 applies a **5 V peak square wave** through:

- \(R10=R11=20\text{ k}\Omega\)
- into \(C_a\) and \(C_b\) (≈ 50 pF each)

At \(f=62.5\text{ kHz}\), the RC attenuation is significant:

\[
\omega = 2\pi f \approx 392{,}699\ \text{rad/s}
\]

A useful approximation for the **clock component amplitude** at each node is:

\[
V(C)\approx \frac{V\_{\text{clk}}}{1+\omega R C}
\]

So:

\[
V*a \approx \frac{V*{\text{clk}}}{1+\omega R C*a},\quad
V_b \approx \frac{V*{\text{clk}}}{1+\omega R C*b}
\]
\[
\Delta V*{\text{in}} \equiv V_a - V_b
\]

Numerical example at \(x=0.1\text{ mm}\), with \(V\_{\text{clk}}=5\text{ V}\):

- \(\omega R C_a \approx 0.438\Rightarrow V_a\approx 5/1.438=3.48\text{ V}\)
- \(\omega R C_b \approx 0.340\Rightarrow V_b\approx 5/1.340=3.73\text{ V}\)

Thus:

\[
\Delta V\_{\text{in}} \approx 3.48-3.73=-0.255\text{ V}
\]

**Debug checkpoint**: if your sim produces a much larger \(|\Delta V\_{\text{in}}|\) (e.g., close to volts for 0.1 mm), you are likely driving Ca/Cb incorrectly (e.g., assuming full clock across the caps).

---

### 2.3 Charge-sharing recursion for C3 and C4

A first-order model of the LTC1043 A section in this app circuit is:

- In phase ϕ1, C3 is charged to \(\Delta V\_{\text{in}}\)
- In phase ϕ2, C3 is connected to C4 → charge sharing
- Therefore the output updates as:

\[
V*{\text{out}}[n+1]
=
\frac{C_4\,V*{\text{out}}[n] + C*3\,\Delta V*{\text{in}}}{C_3+C_4}
\]

This converges to a fixed point:

\[
V*{\text{out}}[\infty]
=
\frac{C_3}{C_3+C_4}\,\Delta V*{\text{in}}
\]

Given \(C_3=C_4=4.7\text{ nF}\):

\[
\alpha\equiv \frac{C*3}{C_3+C_4}=0.5
\]
\[
V*{\text{out}}[\infty]\approx 0.5\cdot(-0.255)=-0.128\text{ V}
\]

So at \(x=0.1\text{ mm}\):

- \(|Vout|\approx 128\text{ mV}\)
- ⇒ \(\approx 1.28\text{ V/mm}\)

This matches the app note claim (~1.25 V/mm) very closely.

**Debug checkpoint**: if implementing this exact recursion does NOT converge near \(-0.128\text{ V}\) for x=0.1 mm, then the error is upstream (Ca/Cb model, clock amplitude, sign conventions, units).

---

## 3) Why a cycle-by-cycle simulator often overshoots by ~4×

Your observed overshoot factor (~4.3×) is consistent with a combination of two common errors:

### 3.1 Missing charge-sharing attenuation (≈2× error)

If you treat the transfer as “add ΔQ to C4” without accounting for C3 and C4 forming a parallel combination during transfer, you may effectively be using:

**Wrong (pumping) update:**
\[
V*{\text{out}}[n+1] = V*{\text{out}}[n] + \frac{C*3}{C_4}\,\Delta V*{\text{in}}
\]

This makes Vout grow much larger than the true fixed point.

In the intended behavior, \(C_3=C_4\) implies a **0.5 factor** from charge sharing. Dropping that can give ~2×.

### 3.2 Overestimating ΔVin because you assumed full clock swing (another ≈2× error)

At 62.5 kHz with 20 kΩ and ~50 pF, the sensor nodes are around **3.6 V**, not 5 V.
Also the **difference** between them is only a few hundred mV for 0.1 mm.

If you instead assume Ca/Cb are driven by the full clock with no RC attenuation, \(|\Delta V\_{\text{in}}|\) can be ~2× too large.

Together: ~2× · ~2× ≈ ~4× → close to your ~4.3×.

---

## 4) Additional failure modes to check

### (A) Using the “differential capacitance slope” as if it were per-capacitance slope

Near center:

- per-cap slope ≈ 61.7 pF/mm
- differential slope (Ca - Cb) ≈ 123 pF/mm

Mixing these can introduce a 2× error in the wrong place.

### (B) Units mistakes

Common: mixing nF/pF, mm/m.

Example: 4.7 nF = 4700 pF. If treated as 4.7 pF, the behavior changes radically.

### (C) Modeling the LTC1043 as transferring charge from a fixed reference each cycle

In this application, internal switching references nodes to Vout/ground in alternating phases. If you model one phase as charging C3 to ΔVin relative to ground each time without respecting how Vout affects the next phase, you may create an artificial net pump.

---

## 5) Concrete debug recipe (minimal test harness)

Implement and test this _standalone_:

1. Given x, compute \(C_a(x)\), \(C_b(x)\)
2. Compute \(\Delta V*{\text{in}} = V(C_a)-V(C_b)\) using
   \[
   V(C)=\frac{V*{\text{clk}}}{1+\omega RC}
   \]
3. Iterate:
   \[
   V*{\text{out}}[n+1]
   =
   \frac{C_4\,V*{\text{out}}[n] + C*3\,\Delta V*{\text{in}}}{C_3+C_4}
   \]
   for e.g. N=200 cycles.

Expected for x=0.1 mm (with the parameters above):

- \(\Delta V\_{\text{in}}\approx -0.255\text{ V}\)
- \(V\_{\text{out}}[\infty]\approx -0.128\text{ V}\)

If you can’t reproduce this with the minimal model, the bug is in your math/units.  
If you can reproduce this, but your “full” simulator diverges, the bug is in the LTC1043 phase modeling (switch connections / reference nodes / sign conventions).

---

## 6) What to paste for further debugging

If you want another LLM (or me) to pinpoint the error precisely, paste:

1. The exact per-cycle update equations for:
   - how you compute charge on C3 in phase ϕ1
   - how you transfer/share charge between C3 and C4 in phase ϕ2
2. Your model for the sensor nodes (whether you include R10/R11 attenuation)
3. Your assumed clock amplitude and where it is applied (across caps or through R)

Most overshoots are obvious once those three are visible.
