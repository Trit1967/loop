# User Simulation Report
**Date:** 2026-03-21
**App:** https://loop.seafin.ai
**Tester:** user-sim skill (automated browser simulation)
**SSH:** root@[VPS] — service health correlated

---

## Result: ❌ 3 BUGS FOUND (1 FIXED this session)

---

## Screenshots
- `00-landing.png` — App loaded, authenticated, dashboard visible
- Session modal open with blank i-proj dropdown
- System stats panel: CPU 0%, MEM 1.1GB/4.0GB, DISK 4.5GB/40.0GB
- Scrollbar visible on hover over terminal pane (purple thumb)

---

## Interaction Map
| Type | Discovered | Tested | Skipped |
|------|-----------|--------|---------|
| Pages | 1 | 1 | 0 |
| Buttons | 18 | 14 | 4 (destructive/OAuth) |
| Forms | 3 | 3 | 0 |
| Modals | 4 | 3 | 1 (cron — no active session) |
| Links | 1 | 1 | 0 |
| Tabs | 6 | 6 | 0 |
| Shortcuts | 5 | 5 | 0 |

---

## Bugs Found

| # | Location | Element | What Failed | Severity | Status | Repro Steps |
|---|----------|---------|-------------|----------|--------|-------------|
| 1 | Sidebar | `#sk-search` input | Searching "front" returned `agent-development`, `command-development`, `example-command`, `plugin-settings` in addition to `frontend-design` — description-based matching causes false positives | MEDIUM | **FIXED** — filter now name-only | 1. Open app 2. Type "front" in skill search 3. See unrelated skills |
| 2 | Backend | WebSocket reconnect | SSH logs show continuous reconnect loop for `test-session-1`, `test-session-2`, `test-session-3` (orphaned from prior test run, no longer in tmux) — every 2.5s, forever | LOW | Not fixed — expected behavior; sessions should be killed after tests | 1. Create sessions via UI 2. Kill tmux sessions on server 3. Observe reconnect loop in `journalctl` |
| 3 | Header / Mic | Alt+M shortcut | Mic button did not activate when terminal pane had focus — key event swallowed by xterm canvas | INFO | Not fixed — browser mic permission or canvas key capture | 1. Focus terminal pane 2. Press Alt+M 3. Command bar does not appear |

---

## REGRESSION CHECK — Previously Fixed Bugs

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
| Sidebar collapse/expand (all 3 sections) | ✅ |
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
| Service uptime healthy (6h+) | ✅ via SSH |
| Port 3000 listening | ✅ via SSH |
| No backend crashes or restarts | ✅ via SSH |

---

## Console Errors
- Chrome extension errors only (noise) — excluded
- No app-originated JS errors on page load

---

## Network Issues
- None found. All API calls returned 200.
- Stale WebSocket reconnect loop for dead sessions (`test-session-1/2/3`) in SSH logs — not a network error, but wasteful.

---

## SSH Backend Correlation

```
Host: root@[VPS]
Service: claude-terminal.service — ACTIVE (running), uptime 6h+
Port 3000: LISTENING
Recent restarts: 0
```

Backend logs showed reconnect loop entries:
```
[WS] Failed to attach to session "test-session-1": Session not found
[WS] Failed to attach to session "test-session-2": Session not found
[WS] Failed to attach to session "test-session-3": Session not found
```
These repeat every ~2.5s. Sessions were created by a prior UX test run and never cleaned up. The backend is healthy; this is orphaned frontend state.

---

## Recommendations

### Fixed This Session
1. ✅ **Skill search filter** — now searches name-only instead of name+description. Eliminates false positives when searching "front", "test", "build", etc.

### Low Priority
2. **Orphaned session cleanup** — after automated test runs, kill tmux sessions (`tmux kill-session -t test-session-*`) to prevent infinite reconnect loops in backend logs. Could add a cleanup step to the loop-ux-tester skill.
3. **Alt+M with terminal focus** — mic shortcut doesn't fire when xterm canvas has keyboard focus. Consider adding a `keydown` listener directly on the xterm terminal instance, or move the mic to a global document-level handler that fires even when canvas captures keys.
