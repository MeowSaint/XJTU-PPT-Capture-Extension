# Native seek frame readiness implementation plan

**Goal:** prevent capture of an old frame after native seek, resolve real CI library670 without weakening its pixel/time assertions, and deliver a verified3.1.3 package.
**Architecture:** strengthen the existing scanner seek owner using bounded native frame evidence; retain old scanner/capture APIs and source-aware cancellation. Task1 and its complete b1375dd-stage review plus scoped I1 fix are locally closed at33450411. Task2 corrects the independently observed review-driver synchronization boundary only. Use a fresh implementer per task; Task2 gets one fresh highest task+new-delta review from33450411, with byte guards and real full CI, without duplicating already reviewed unchanged runtime.
**Tech Stack:** MV3/native JavaScript, Node20+, existing Playwright/FFmpeg/Chromium, current release builder.
**Spec:** `docs/superpowers/specs/2026-11-08-seek-frame-readiness-design.md` (binding).

## Global Constraints

The four Global Constraints in the binding spec apply verbatim; prepend them to generated task briefs and reviewer prompts.

## Review Focus

- seeked/currentTime/decoded counters are not target-frame pixels. Old queued callbacks and opposite event orders must not certify a later seek.
- Paused same-time requests, sparse/VFR and source changes must not hang or depend on a guessed frame interval; frame correlation and any cache invalidation need explicit controls.
- One30s bound and complete callback/listener/timer cleanup, abort/error cause and no post-abort capture/checkpoint are part of correctness.
- Synthetic adapters must describe synthetic frames honestly, preserve all old Canvas/JPEG/IDB assertions, and cannot silently bypass production fences.
- Runtime scanner/load-owner changes invalidate old dependent checks and ZIP375 identity. Preserve other33 resources/old ZIP backup, run final affected matrix and verify rebuilt35 payloads/CRC/version/SHA; real CI remains required.

### Task 1: correlate seek completion with the readable video frame

**Files:** Modify `scanner.js`, `capture.js`, `tests/scanner.test.cjs`, `tests/library.cjs`, `tests/improvements.cjs`; `tests/core.test.cjs` and `tests/discovery.test.cjs` only for the new direct load-observer dependency/meaningful load regression controls with all original assertions retained. Own report `.superpowers/sdd/2026-11-08-seek-frame-readiness/task-1-report.md`. Generated raw `.test-output/seek-frame-readiness/`, ordinary runner evidence and verified package/release-script backups allowed.
**Consumes:** current scanner seek API, native library583–686 pixel/time control and Linux670 error; scanner unit cleanup tests450–489; improvements synthetic adapter122–126 and restoration; existing release35 list and original-source/coverage contracts.
**Produces:** same seek API with bounded fresh-frame completion, meaningful timing regressions, unchanged existing business assertions, rebuilt verified3.1.3 package and truthful source/report provenance.

1. Read binding scope and named callers; record baseline hashes. Add controlled delayed-frame/stale-callback/event-order assertions. Run true RED against unchanged scanner. Make one bounded native observation with existing local fixture; preserve lack of Linux reproduction if applicable.
2. Implement the smallest scanner plus actual load-owner fix. The initial0 control proved state-only adoption unsafe/first callback already gone: arm a shared weak per-video observer immediately before src/HLS attachment, await initial confirmed evidence and old load readiness, dispose in owner finally. Preserve requested-time mapping,45s load/30s seek error/abort semantics. No fixedFPS/sleep/retry/playback/nudge; every callback/listener/timer/promise owned and removed without masking primary errors.
3. Add positive/negative controls for same-time paused/new scanner, initial audio-only, source changes, callback order, abort/native error/timeout/setter and cleanup. Adapt improvements' synthetic frame API and only new direct core/discovery VM dependencies; no glyph/threshold/count/business changes. Native probes must use the same actual pre-src observer, preserving exact initial/repeat/three-slide pixels/times. If another owner is proven necessary, return concrete NEEDS_CONTEXT.
4. Freeze final runtime/adapter inputs and execute the spec's nine checks serially once, preserving failed epochs and exact stdout/stderr/exit. Use already installed browser via PPT_TEST_BROWSER, no installation or unrelated environment changes. Explain any dependency-based reuse after fixture-only edits.
5. Run current release builder, preserving old canonical ZIP through its safe backup. Independently verify35 members/CRC/source bytes/version/SHA; only scanner/capture runtime resources may differ from baseline. No main-worktree ZIP changes. Self-review API/callers/assertion inventory/cancel/cleanup and source input map.
6. Stage only the seven allowed source/test paths actually changed; commit `fix: confirm video frame readiness across load and seek`. Write complete own report with actual results/limits/raw/package hash and source commit; commit report separately, avoid self-referential final hash. Collect all owned jobs and close contexts/browser/server before DONE (callback<=15lines). No delegation or remote operations.

### Task 2: synchronize the review file-load driver with actual readiness

**Files:** Modify only `tests/review.cjs`; own report `.superpowers/sdd/2026-11-08-seek-frame-readiness/task-2-report.md`. Generated raw `.test-output/seek-frame-readiness/task-2/` allowed. No runtime, other fixture, package, dependency, permission or version edits.
**Consumes:** Task1/current33450411 actual frame-promise/operation ownership; capture.js448,796–799,883,1522–1538; review.cjs99–109/378–400; ONE completed diagnostic summary/closure and exact CI log. Actual source remainsbf6 and current35-member packageD05.
**Produces:** same native review scenarios with a driver that selects only when enabled/idle and confirms the requested source actually bound, genuine controlled RED/GREEN, all original19 groups preserved and a final FULL review/input map.
**Review Focus:** clock/currentTime is not operation settlement; old sourceReady must not count as the selected file. Preserve path-file metadata and same-file reload; keep waits bounded and all controls/hooks owned. Do not turn the local diagnostic into a claim about the unobserved CI cause.

1. Read binding Task2 and named callers, record actual hashes and all original assertions/groups. Add one deterministic meaningful driver regression that fails the original helper; preserve command/stdout/stderr/numeric exit. No repeated native diagnostic or pixel fabrication.
2. Make the smallest private review-helper synchronization and intended-file verification change. Preserve every original scenario/assertion and fixed bounds; no runtime edits, sleeps/retries or weaker equality.
3. Run focused GREEN/control and original native same-name source case, then freeze final inputs and run FULL review once using existing Chromium. Reuse unaffected suites only with exact input maps, preserving old failures and qualification. Restore hooks, collect all owned jobs and close browser/context/server.
4. Self-review original assertions/callers/cleanup, verify all35 runtime resources, other fixtures and packageD05 unchanged. Stage only the allowed file and commit `test: wait for review file-load ownership`; write complete own report and commit it separately without a self-referential hash. DONE callback<=15lines; no delegation/remote operations.
