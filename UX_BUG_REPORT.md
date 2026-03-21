# Loop Terminal UX Bug Report
**Date:** 2026-03-21
**Tester:** loop-ux-tester skill (automated browser automation)
**Commit:** 33239a5 (fix: use visibility:hidden instead of display:none to preserve WebGL contexts)

---

## Result: ❌ 2 BUGS FOUND (plus 1 regression note)

---

## Screenshots
Screenshots taken during session (in-browser, not saved to disk — browser automation limitation):
- Page load: dashboard loaded, authenticated
- Session modal: project picker, session name, mode selector all visible
- After session creation: terminal rendered with welcome card
- Two sessions created: both tabs visible, Sessions count = 3
- Workflow created: side-by-side panes with "No session assigned"
- Pane 1 assigned: terminal renders in pane 1 ✅
- Both panes assigned: BOTH terminals render simultaneously ✅ ← main bug FIXED
- Stacked layout: both sessions visible stacked vertically ✅
- Triple layout: 3 panes, 2 assigned + 1 empty state ✅
- Alt+N modal: opens over workflow with both panes still visible ✅
- System stats: real values, no dashes or impossible percentages ✅
- Post-deletion: workflow removed, session view restored ✅

---

## Bugs Found

| # | Step | What Failed | Severity | Notes |
|---|------|-------------|----------|-------|
| 1 | Step 9 — Keyboard Shortcuts | Alt+Shift+N opens **New Session** modal instead of **New Workflow** modal | Medium | Wrong shortcut binding. The handler for `Alt+Shift+N` calls `openSession()` instead of `openWorkflow()`. Fix: swap the `altKey+shiftKey+N` handler to trigger the workflow modal. |
| 2 | Step 9 — Voice | **Mic button stays orange/active** after pressing Escape to close command bar | Low | Visual state not reset when voice is dismissed via Escape. The `hideCmdBar()` function needs to also update the mic button's active CSS state. |
| 3 | All terminal views | **Terminal prompt at top with whitespace below** — cursor and output appear at row 1-3 of xterm canvas, with 20+ empty rows below | Low | Expected for freshly started sessions (only a few lines of output). Not a rendering bug per se. Could improve UX by calling `term.scrollToBottom()` on session attach, but with minimal output this won't push content to bottom. Consider injecting N blank lines on session start to visually anchor prompt to bottom. |

---

## CRITICAL BUG STATUS: ✅ FIXED

**The blank/dot pane bug is confirmed FIXED.**

Previously, assigning a session to Pane 2 would cause Pane 1's terminal to go blank (dots/particle canvas showing through). This is now working correctly:

- Pane 1 assigned → terminal renders ✅
- Pane 2 assigned → BOTH panes show live terminals simultaneously ✅
- Pane 1 terminal remains visible after Pane 2 is assigned ✅
- Layout switching (side-by-side → stacked → triple) preserves both terminals ✅
- No dots or blank canvases observed in any configuration ✅

The `visibility:hidden` fix (commit 33239a5) successfully preserves WebGL contexts.

---

## Passed Checks

| Check | Result |
|-------|--------|
| Page loads, authenticated (not redirected to login) | ✅ |
| No app JS errors on load (only chrome-extension errors, not ours) | ✅ |
| Particle canvas visible in background | ✅ |
| Sidebar with 3 sections (Skills, Loop Skills, Commands) | ✅ |
| Mic button in header | ✅ |
| + Session button accessible | ✅ |
| + Workflow button in tab bar | ✅ |
| Session modal opens with Project picker, Session name, Mode | ✅ |
| Project dropdown shows cloned repos (loop, seafin-customer) | ✅ |
| Session created — tab appears, terminal renders | ✅ |
| Second session created — both tabs visible, switch works | ✅ |
| Sessions count (right panel) updates correctly | ✅ |
| Workflow modal opens with name + layout selector | ✅ |
| All 5 layouts available (single, side-by-side, stacked, triple, quad) | ✅ |
| Workflow tab created, workflow appears in tab bar | ✅ |
| Two panes show "No session assigned" + Assign Session buttons | ✅ |
| Assign modal has Existing session dropdown + Project picker + Mode | ✅ |
| Existing sessions listed in assign dropdown | ✅ |
| Pane 1 shows terminal after assignment (no dots) | ✅ **CRITICAL** |
| Pane 1 still visible after Pane 2 assigned (no blank) | ✅ **CRITICAL** |
| Both panes show live terminals simultaneously | ✅ **CRITICAL** |
| Stacked layout — both terminals visible | ✅ |
| Triple layout — 3 panes, 2 with terminals, 1 empty state | ✅ |
| Layout switch back to side-by-side works | ✅ |
| Alt+N opens New Session modal | ✅ |
| Escape closes modal | ✅ |
| Alt+M activates voice / shows command bar with Send button | ✅ |
| System stats show real values: cpu %, mem GB/GB, disk GB/GB | ✅ |
| Workflow tab deleted — returns to session view | ✅ |
| Sessions persist after workflow deletion | ✅ |

---

## Recommendations

### Priority 1 — Fix Alt+Shift+N shortcut (Medium, 5 min fix)
In `public/index.html`, find the `keydown` handler for `Alt+Shift+N` and change it to call `openWorkflow()` / `document.getElementById('btn-wf').click()` or equivalent. Currently it appears to call the session modal open function.

### Priority 2 — Fix mic active state on Escape (Low, 5 min fix)
In `hideCmdBar()` (or the Escape handler), ensure `document.getElementById('btn-mic').classList.remove('active')` is called (or equivalent state reset). The mic button should return to its inactive appearance when voice is dismissed.

### Priority 3 — Terminal prompt position (Low, UX improvement)
Consider writing N empty lines into the xterm buffer on session attach so the first interactive prompt appears near the bottom of the viewport. Example:
```js
const rows = term.rows;
for (let i = 0; i < rows - 4; i++) term.write('\r\n');
```
Or alternatively, explore xterm.js `scrollToBottom()` after initial data is received.
