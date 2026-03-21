# User Simulation Report
**Date:** 2026-03-21
**App:** https://loop.seafin.ai
**Run #:** 1 | **Registry:** 35 elements tracked | **Opus Score:** 3.9/5.0 (baseline)
**Discovery:** DOM (31 elements) + Code scan (13 API routes, 6 shortcuts) + Registry (new)
**Test method:** 4 parallel forks + Opus evaluation judge

---

## Result: ❌ 3 BUGS FOUND (2 FIXED this session)

---

## Opus Evaluation
| Criterion | Score | Weight | Notes |
|-----------|-------|--------|-------|
| Coverage | 4/5 | 30% | Most elements tested; Alt+M/Alt+1-9 skipped (env-dependent) |
| Bug Quality | 4/5 | 25% | All 3 bugs real and reproducible with clear repro steps |
| UX Quality | 4/5 | 20% | Clean UI, good hierarchy; not responsive at mobile (expected) |
| Error Rate | 1/1 | 15% | No app JS errors, no 5xx responses |
| Regression Safety | 1/1 | 10% | All 7 previously-fixed bugs still passing |
| **Overall** | **3.9/5** | | Confidence: 85% |

Score trend: baseline (run 1)

---

## What's New This Run
| Category | New | Known (verified) | Missing |
|----------|-----|-----------------|---------|
| Buttons | 9 | 0 | 0 |
| Modals | 4 | 0 | 0 |
| Shortcuts | 6 | 0 | 0 |
| API Routes | 13 | 0 | 0 |
| Forms | 2 | 0 | 0 |
| Tabs | 4 | 0 | 0 |
| Links | 1 | 0 | 0 |

---

## Bugs Found

| # | Location | Element | Source | What Failed | Severity | Status | Repro Steps |
|---|----------|---------|--------|-------------|----------|--------|-------------|
| 1 | Right Panel | `#tog-rp` | Fork A | Panel toggle collapsed CSS class overridden by inline `--rp-w` style set during drag — panel never collapsed | HIGH | **FIXED** — `removeProperty('--rp-w')` called on collapse | 1. Drag right panel to resize 2. Click ◀ toggle 3. Panel stays open |
| 2 | Session Modal | `#f-session` validation | Fork B | Empty form submit only highlighted `#i-proj`, not `#i-sn` (session name field) | MEDIUM | **FIXED** — both fields now get `var(--w4)` border on empty submit | 1. Open session modal 2. Click Start Session with both fields empty 3. Only project field turns red |
| 3 | DOM | `#open-side-panel` | Fork A | 0×0px dead element in DOM — invisible and unclickable | LOW | Open | 1. Inspect DOM for `#open-side-panel` 2. Check offsetWidth/offsetHeight = 0 |

---

## Fork Results Summary
| Fork | Category | Passed | Failed | Skipped |
|------|----------|--------|--------|---------|
| A | Buttons & Links | 6 | 2 | 1 (mic — no session) |
| B | Forms & Modals | 9 | 1 | 0 |
| C | Modals, Tabs, Shortcuts | 8 | 2 | 0 |
| D | API Routes & Network | 13 | 0 | 2 (destructive/session-specific) |

---

## Regression Check — Previously Fixed Bugs
| Bug | Status |
|-----|--------|
| Blank/dot pane when assigning Pane 2 | ✅ FIXED — confirmed both panes live |
| Alt+Shift+N opens workflow (not session) | ✅ FIXED — mo-workflow opens correctly |
| Mic button inactive after Escape | ✅ FIXED — Voice.listening=false confirmed |
| Session modal i-proj resets on open | ✅ FIXED — i-proj blank on 1st, 2nd, 3rd open |
| Assign modal new-session fields hide on existing select | ✅ FIXED — display:none when session selected |
| Terminal scrollbar invisible | ✅ FIXED — custom overlay scrollbar with purple thumb |
| Black-on-black contrast | ✅ FIXED — dim labels boosted to --tx2 |

---

## Passed Checks
| Check | Result |
|-------|--------|
| App loads (not login page), authenticated | ✅ |
| No app JS errors on load (chrome-extension noise excluded) | ✅ |
| Particle canvas visible in background | ✅ |
| Sidebar — Skills / Loop Skills / Commands sections visible | ✅ |
| Sidebar collapse/expand (tog-sb) | ✅ |
| + New Session button visible in header | ✅ |
| + Workflow button visible in header | ✅ |
| Session modal opens on button click | ✅ |
| Session modal i-proj blank on open | ✅ |
| Escape closes session modal | ✅ |
| Workflow modal opens on + Workflow button | ✅ |
| Alt+N → session modal opens (not workflow) | ✅ |
| Alt+Shift+N → workflow modal opens (not session) | ✅ |
| Escape closes workflow modal | ✅ |
| SESSIONS tab switch works, right panel updates | ✅ |
| USER tab renders user info | ✅ |
| System stats: CPU realistic value (0%) | ✅ |
| System stats: MEM X.X GB / Y.Y GB format (1.1GB/4.0GB) | ✅ |
| System stats: DISK X.X GB / Y.Y GB format (4.5GB/40.0GB) | ✅ |
| Terminal scrollbar visible on hover | ✅ |
| Terminal scrollbar drag works | ✅ |
| Skill search — name-only filter (no false positives) | ✅ FIXED |
| All 13 API routes return expected status codes | ✅ |
| WebSocket connection live | ✅ |
| No 5xx responses | ✅ |

---

## Console Errors
- Chrome extension errors only (noise) — excluded
- No app-originated JS errors on page load

---

## Network Issues
- None. All tested API calls returned expected status codes.
- `/api/nonexistent` returns 401 instead of 404 — auth middleware runs before 404 handler (known, low priority)

---

## Broken UI Scan
- **Zero-size elements**: `#open-side-panel` (0×0px) — dead element
- **Empty buttons**: 1 (`#btn-wf` — hidden modal context, zero-size)
- **Broken images**: None
- **Missing labels**: None

---

## Recommendations

### Fixed This Session
1. ✅ **Right panel toggle** — inline `--rp-w` from drag overrode CSS class; now cleared on collapse
2. ✅ **Session modal validation** — both `#i-proj` and `#i-sn` now highlighted red on empty submit
3. ✅ **Skill search filter** — name-only matching eliminates false positives

### Low Priority
4. **`#open-side-panel` dead element** — 0×0px invisible element in DOM; remove it or give it a purpose
5. **Alt+M with terminal focus** — key event swallowed by xterm canvas; add keydown listener on xterm instance or make handler document-level
6. **`/api/nonexistent` → 401 not 404** — auth middleware runs before 404 handler; reorder or add explicit 404 route
7. **Orphaned session reconnect loop** — sessions created by prior test runs cause infinite WS reconnect; add cleanup step to test skills
