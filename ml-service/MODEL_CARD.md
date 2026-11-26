# Model card: `seasonal-robust-z/1` (Home Pulse ML service)

## What it is for

Per appliance, it learns what the power draw normally looks like **at each time of day** and flags a sustained
change of the running power (`POWER_SHIFT`) or of the running pattern (`DUTY_CYCLE_DRIFT`: share of time ON, length
of ON runs). home-pulse asks it first and keeps its built-in detector (median/MAD on 6-hour windows) as the fallback
and for the rule-based kinds (`STUCK_ON`, `STOPPED`, `NO_DATA`), which this model never decides.

It is a decision aid for "get the appliance checked", not a safety system. It does not diagnose causes.

## Data

* **Training:** the appliance's own 1-minute samples from the baseline's learning window (the first 7 days by default;
  the same samples home-pulse's built-in baseline learns from). home-pulse sends them; the service has no database
  access. Minimum: 72 usable clock hours (an hour is usable with 70% of its minutes).
* **No real appliance data was used, anywhere.** Development, tuning and evaluation used home-pulse's simulator
  (`home-pulse/src/test/.../sim/ApplianceSimulator.java`: fridge and split AC with diurnal demand, day-to-day weather,
  door openings, 1.5% sensor noise, 0.3% dropouts). Unit tests use a Python port of it (`tests/sim.py`).
* What is stored per appliance: the ON/OFF threshold, 24 or 168 slot medians per feature, the hourly mean-power band,
  and the calibration constants. No raw readings are kept.

## Method

1. ON/OFF threshold = midpoint of the 10th and 99th percentile of the training power (10% of the way for a washing
   machine). A load that barely varies is "non-switching": only its power level is modelled.
2. Window features over the 6 clock hours before each full hour: duty (share of minutes ON), median ON power, mean
   length of ON runs that start and end inside the window.
3. Seasonal profile: each training window is filed under the slot of its end hour (hour of day; hour of week once the
   training data spans 3 weeks) and the profile is the median per slot, pooled with both neighbouring slots.
4. Residual = observed / expected - 1 (power, run length) or observed - expected (duty). Over the training windows:
   robust centre and sigma (1.4826 x MAD, floored at 2% / 0.02 / 5%), z = (residual - centre) / sigma, and the
   threshold max(4, 1.25 x the largest |z| seen in training): the training week itself would never alert.
5. Decision: anomalous when the windows ending at the newest 3 full hours all exceed the threshold in the same
   direction. Score = min |z| / threshold (> 1 = anomalous). A feature with a live alert uses 70% of its threshold.
6. Air conditioners are judged on power only (see limits); home-pulse's built-in detector keeps judging their duty.
7. Forecast: the hourly mean-power profile, median with a p10..p90 band, for the next N hours (default 24).

Why not IsolationForest or Holt-Winters: one week of training gives 7 values per hour-of-day slot. A robust
per-slot median with a calibrated residual is explainable ("27% more than normal for this time of day"), needs no
extra dependency beyond numpy, and calibration on the training residuals sets its own false-alarm level. Holt-Winters
needs several seasons to fit its smoothing parameters; an isolation forest gives a score without a unit to explain.

## Evaluation

Reproduce: `ml-service/eval/run.sh` (Docker and a JDK; nothing installed on the host). home-pulse's
`MlEvaluationExportTest` generates the episodes with the Java simulator and replays the **real** built-in detector
and reconciler over them (hourly); `eval/evaluate.py` trains this model on the same learning week and replays it
hourly with the same alert lifecycle (open, hysteresis, resolve after 3 clean runs). Only `POWER_SHIFT` and
`DUTY_CYCLE_DRIFT` openings are compared.

Episodes: 23 days; learn days 0-7; faults start on day 9; judged days 7-23. Nine scenarios. Parameters (thresholds,
floors, the AC power-only rule) were chosen on seeds 101-103 (27 episodes) and frozen; the numbers below are the
held-out seeds 1-10 (90 episodes), run on 2026-11-27.

A detection is an alert opened at or after the fault onset. A false alert is any opening on a healthy episode or
before the onset. Precision = detected / (detected + false alerts); recall = detected / fault episodes.

| scenario (10 seeds each) | MAD detected | ML detected | MAD false | ML false | MAD median latency | ML median latency | fault size when caught (MAD / ML) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fridge healthy | - | - | 0 | 1 | - | - | - |
| fridge power +1%/day | 10/10 | 10/10 | 0 | 0 | 255.5 h | 198 h | 10.6% / 8.2% |
| fridge power step +12% | 10/10 | 10/10 | 0 | 0 | 16 h | 6 h | 12% / 12% |
| fridge power step +7% | 0/10 | 1/10 | 0 | 0 | - | 277 h | - / 7% |
| fridge refrigerant leak (runs +3%/day) | 0/10 | 10/10 | 0 | 0 | - | 156.5 h | - / runs +19.6% |
| AC healthy | - | - | 0 | 0 | - | - | - |
| AC power +1%/day | 10/10 | 10/10 | 0 | 0 | 264 h | 202 h | 11% / 8.4% |
| AC power step +12% | 10/10 | 10/10 | 0 | 0 | 21 h | 9.5 h | 12% / 12% |
| AC power step +7% | 0/10 | 4/10 | 0 | 0 | - | 133 h | - / 7% |

| model | appliance | precision | recall | false alerts (460 healthy days) |
| --- | --- | --- | --- | --- |
| MAD | fridge | 1.000 | 0.500 | 0 |
| MAD | AC | 1.000 | 0.667 | 0 |
| MAD | all | **1.000** | **0.571** | 0 |
| ML | fridge | 0.969 | 0.775 | 1 |
| ML | AC | 1.000 | 0.800 | 0 |
| ML | all | **0.982** | **0.786** | 1 |

Reading it: the model catches the same power faults earlier (at about 8% excess instead of about 11%, 2.5 days
sooner on a 1%/day ramp; 6-10 hours after a step instead of 16-21) and catches the refrigerant leak, which the
built-in detector misses within 14 days on this simulator. It costs one false alert in 460 healthy appliance-days
(a `DUTY_CYCLE_DRIFT` on healthy fridge seed 9). A 7% step is at the edge of both: mostly missed.

Tuning split (seeds 101-103) for transparency: MAD precision 1.0 / recall 0.571; ML 1.0 / 0.762. Before the AC
power-only rule the ML had 5 false AC duty alerts in 66 healthy days there, which is why the rule exists.

## Limits

* **Simulated data only.** Real plugs have other noise, multiple loads on one plug, firmware quirks; real faults are
  messier than ramps and steps. These numbers say the method works on the simulator, not that it works in a kitchen.
* **No weather.** An AC's duty follows the outdoor temperature, which the model does not see: that is why AC duty is
  left to the built-in detector's wide tolerance. A heat wave can still shift AC power slightly (the simulator adds
  3% per 6 degrees).
* **One learning week defines normal**, as for the built-in detector: an appliance already degraded when installed
  looks normal, and slow seasonal drift over months is not modelled (re-learning resets it). Weekly patterns are only
  learned when the training window spans three weeks, which home-pulse's default 7-day learning never sends.
* **Not evaluated** on water pumps, washing machines or "other" loads (the model runs for their power level, but
  without published numbers), on the cycle feature of non-fridge appliances, or on fault sizes below 7%.
* Latency is bounded below by the 6-hour window plus 3 hourly confirmations.
* The service has no authentication of its own: it must only be reachable by home-pulse (NetworkPolicy in Helm,
  internal network in compose, loopback in dev).
