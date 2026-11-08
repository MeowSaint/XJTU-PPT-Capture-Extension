# Native seek frame readiness implementation plan

**Goal:** prevent capture of an old frame after native seek, resolve real CI library670 without weakening its pixel/time assertions, and deliver a verified3.1.3 package.
**Architecture:** strengthen the existing scanner seek owner using bounded native frame evidence; retain old scanner/capture APIs and source-aware cancellation. Adapt only the explicit synthetic Canvas seek adapter to the same API contract. One fresh implementer, one fresh highest Task+complete-stage review from the pre-plan b1375dd baseline; no reopening previous closed stages.
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
