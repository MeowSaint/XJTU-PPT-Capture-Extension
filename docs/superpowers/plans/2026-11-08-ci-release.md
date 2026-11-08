# 3.1.3 CI Release Implementation Plan

> For agentic workers: use subagent-driven-development, one fresh task implementer and fresh independent review.

**Goal:** Resolve the observed Linux CI synchronization failures without weakening business assertions or changing runtime.
**Architecture:** Await actual asynchronous completion at each named fixture boundary: discover completion, bounded ZIP generation/native delivery, and IndexedDB-backed library startup before treating an empty gallery as restored. Retain native actions, cancellation and all previous assertions. A proven runtime defect requires concrete context rather than guessing beyond scope.
**Tech Stack:** Existing JS, Node20+, Playwright, installed Chromium, no dependencies added.
**Spec:** docs/superpowers/specs/2026-11-08-ci-release-design.md

## Global Constraints

- Chrome114+/Node20+, existing dependencies only; no installs or real school/profile access.
- Only the explicitly named owning fixture per task (Task1 tests/features.cjs; Task2 tests/memory.cjs; Task3 tests/library.cjs) plus its own report; runtime, version, assets, permissions and IDB unchanged.
- Preserve all11 business cases and native click/cancel/stale-result assertions; no sleep or count relaxation to pass.
- Preserve real RED/failures, actual inputs/results/cleanup; original final M2 remains disclosed.

## Review Focus

- Early old requests before discover reset: prove the baseline waits actual completion.
- Transparent onclick observer: preserve this/event/Promise result and restore handler.
- Held requests: third queued old URL must never start after fresh cancellation.
- Late old results: fresh valid candidates survive, no old options reappear.
- Build scope: 35 shipped members and original ZIP SHA remain unchanged.
- Empty startup: zero gallery cards and !busy() can both be true before ready; prove count(0) cannot settle during held real startup.
- Restore readiness: keep the original enabled-empty-library assertion and every deletion/reload/storage assertion; do not wait on the assertion itself as a substitute for actual startup completion.

### Task 1: Await the correct preflight cancellation boundary

**Files:** Modify tests/features.cjs. Create only own .superpowers/sdd/2026-11-08-ci-release/task-1-report.md.
**Interfaces:** Consumes actual #discover.onclick async discover(), unchanged PPTWorkspace.cancelPreflight()/refreshSources. Produces the same11-case installed-extension features script with explicit cancellation preconditions.
- [ ] Read the named failing case/server, discover2195–2285 and queue workspace57–105; record real Linux RED4!==2 at d79d89c.
- [ ] Add exact actual-discover completion observation with original receiver/event/return and guaranteed restoration. Keep old responses held; assert no queued third URL before and after course flip, original request-count stability and fresh/no-old candidate checks.
- [ ] Preserve a deterministic old-boundary observation if practicable; do not call a passing diagnostic RED or invent Linux reproduction.
- [ ] Run one final FULL features using existing PPT_TEST_BROWSER; capture actualstdout/stderr/exit, request boundary evidence, hashes and close all owned resources. No other full local suites.
- [ ] Verify test-only scope/unchanged ZIP and commit fix; write a complete own report with limitations. Fresh independent review full task range before push/CI.

### Task 2: Separate ZIP production from bounded native download observation

**Files:** Modify tests/memory.cjs only. Create own .superpowers/sdd/2026-11-08-ci-release/task-2-report.md.
**Interfaces:** Consumes unchanged exportRetained('zip') Promise and native Playwright download; produces the same16-case memory suite and actual2k native ZIP proof. Task1features fixture must not change.
- [ ] Read named remote-job.log1126–1146, memory350–486/538–571 and directexport helper; record supplied Linux timeout RED, not a local reproduction.
- [ ] Establish bounded event/producer ownership; subscribe before producer, handle rejection immediately, preserve early event, apply30000ms to missing native event after producer completes, fail/cleanup on producer error. Keep a meaningful bounded producer/progress guard instead of unbounded waiting or blind timeout enlargement.
- [ ] Exercise meaningful boundary controls using a small budget without replaying heavy suites; preserve actual native saveAs and every original ZIP/image/read/heap/cache/thumbnail/retention/append assertion. Observe relevant durations/status, no product/policy changes.
- [ ] Run final FULL16 memory once on final fixture with existing browser; capture quartets/inputs/native producer-event timings/full2000-file integrity and all resources closed. No unaffected features or other suite repeats.
- [ ] Verify exacttest+ownreport and unchanged35runtime/ZIP, self-review, source+report commits; fresh independent spec/quality/whole new-delta review before push and actual remoteCI.

### Task 3: Wait for real library startup before accepting an empty gallery

**Files:** Modify tests/library.cjs only. Create own .superpowers/sdd/2026-11-08-ci-release/task-3-report.md.
**Interfaces:** Consumes actual ready/dbReady startup and existing count(n)/idle() helpers; produces unchanged deletion, empty-library-enabled and persistence assertions, with a deterministic held-startup regression.
- [ ] Read supplied remote-job.log1194–1215 and library20–30/2189–2206 plus capture31–52/874–897; retain true Linux true!==false RED without claiming a local replay.
- [ ] Prove zero cards/!busy can precede ready using bounded real held startup; old count(0) must demonstrably settle too early while the fixed helper remains pending until the actual startup completes. Restore every observer/IDB hook and close resources.
- [ ] Make the smallest fixture-only readiness fix. Preserve exact requested counts, original enabled-empty-library/deletion/reload/disk assertions, and all existing cases. No sleeps, retries, product changes or direct control-state manipulation.
- [ ] Run focused meaningful RED/GREEN and once final FULL library on final source with the existing browser. Preserve actual native exports, media/binding/coverage/1388/page-limit/management/crop cases and raw quartets/source epoch/resource cleanup. No unaffected suite repeats.
- [ ] Verify library+ownreport scope, unchanged Task1/2 fixtures and35runtime/ZIP; self-review, source/report commits and fresh independent task/complete-new-stage review, then actual remoteCI.
