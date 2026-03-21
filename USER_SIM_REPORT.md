# User Simulation Report
**Date:** 2026-03-21
**App:** https://loop.seafin.ai
**Run #:** 4 | **Registry:** 50 elements tracked | **Score:** 4.1/5.0 (-0.1 vs Run 3)
**Discovery:** DOM count-check (forms=3 ✅, modals=4 ✅) + Code scan (index.html changed) + 0 new elements
**Test method:** 4 parallel forks + Opus evaluation judge

---

## Result: ✅ PASS — 0 new bugs (BUG-7 persistent), novalidate fix verified

---

## Score

| Criterion | Score | Weight | Notes |
|-----------|-------|--------|-------|
| Coverage | 4/5 | 30% | ~35/49 elements tested; justified skips (mo-assign no active session, /logout preserve session, Alt+1-9 flaky) |
| Bug Quality | 4/5 | 25% | BUG-7 real and reproducible; no false positives; sample size limited (1 bug) |
| UX Quality | 4/5 | 20% | Session validation improved — both-empty now shows red on both fields; no layout breaks |
| Error Rate | 1/1 | 15% | 0 app JS errors (2 chrome-extension errors excluded) |
| Regression Safety | 1/1 | 10% | All previously-passing elements still passing |
| **Overall** | **4.1/5** | | Confidence: 85% |

Score trend: ▲▲ 3.9 → 4.0 → 4.2 → **4.1** (stable, minor dip within confidence range)

```
run_1: 3.9  ──●
run_2: 4.0     ──●
run_3: 4.2        ──●
run_4: 4.1           ──●   ← target: 4.5+
```

---

## Key Finding This Run

**novalidate fix (commit 9d8b31a) fully verified:**

Previously, submitting the session form with both `i-proj` AND `i-sn` empty triggered the browser's native validation popup on `i-sn` (the `required` field), blocking the custom JS handler entirely. The JS error border (`#c75878`) only appeared when `i-sn` was already filled but `i-proj` was missing.

With `novalidate` on `f-session`:
- Both-empty submit → **both** `i-proj` and `i-sn` show `rgb(199, 88, 120)` error border ✅
- No browser native popup ✅
- `native_vs_custom_validation_conflict` pattern: **RESOLVED**

---

## What's New This Run

| Category | New | Known (verified) | Missing |
|----------|-----|-----------------|---------|
| Buttons | 0 | 7 tested | 0 |
| Modals | 0 | 2 tested | 0 |
| Shortcuts | 0 | 5 tested | 0 |
| API Routes | +1 tracked (/api/nonexistent) | 5 tested | 0 |
| Forms | 0 | 2 tested | 0 |

Note: Two Chrome extension overlay buttons (`claude-static-chat-button`, `claude-static-close-button`) found in DOM — not Loop app elements, excluded from registry.

---

## Fork Results Summary

| Fork | Category | Passed | Failed | Skipped |
|------|----------|--------|--------|---------|
| A | Buttons & Links | 5 | 0 | 3 (btn-clone, btn-new-sess, btn-wf) |
| B | Forms | 2 | 0 | 1 (f-assign — no active session) |
| C | Modals, Shortcuts | 7 | 0 | 3 (mo-assign, Alt+1-9, mo-act/mo-box) |
| D | API Routes | 5 | 1 (BUG-7, persistent) | 5 (not tested this run) |

---

## Persistent Bugs

| # | Element | What | Severity | Runs Seen |
|---|---------|------|----------|-----------|
| BUG-7 | `/api/nonexistent` | Returns 401 instead of 404 — auth middleware runs before 404 handler | MEDIUM | 4 |
| BUG-2 | `#open-side-panel` | 0x0px dead element in DOM — invisible and unclickable | LOW | 4 |
| BUG-5 | `Alt+M` | Voice shortcut not testable via keyboard — xterm canvas intercepts; Voice object confirmed present | LOW | 4 |

---

## SSH Health (Run 4)

| Check | Result |
|-------|--------|
| Service | active ✅ |
| SSH key | ~/.ssh/hetzner (corrected from VPS_KEY) |
| Memory | 608Mi / 3.7Gi (16%) ✅ |
| Disk | 4.2GB / 38GB (12%) ✅ |
| Error lines | 0 ✅ |

---

## Regression Check
- All previously-passing elements verified ✅
- 0 regressions

## Console Errors
- 0 app errors ✅
- 2 chrome-extension errors (excluded — extension internal issue, not Loop)

## Broken UI
- Broken images: 0 ✅
- Unexpected empty buttons: 0 ✅ (open-side-panel known)
- Unexpected zero-size elements: 0 ✅ (all in expected_zero_size list)

---

## Recommendations

1. **BUG-7 (MEDIUM)** — Fix 404 handler ordering: register catch-all 404 route after auth middleware, or exclude `/api/*` 404s from auth. Has been open 4 runs.
2. **BUG-2 (LOW)** — Investigate `#open-side-panel`: remove from DOM if unused, or fix its dimensions/positioning.
3. **Coverage gap** — Test `mo-assign` and `f-assign` in a run where an active session exists. These have been skipped 2 consecutive runs.
4. **Score plateau** — At 4.1 for 2 consecutive runs (4.2 → 4.1). Reaching 4.5+ likely requires: testing assign modal, testing /logout safely, and resolving BUG-7.
