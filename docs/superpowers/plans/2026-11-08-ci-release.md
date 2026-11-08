# 3.1.3 CI Release Implementation Plan

> For agentic workers: use subagent-driven-development, one fresh task implementer and fresh independent review.

**Goal:** Resolve the observed Linux preflight cancellation acceptance failure without weakening cancellation or changing runtime.
**Architecture:** Await the actual asynchronous discover onclick completion before sampling the held old generation, retain native clicks and cancellation, assert no queued old URL and no stale candidates. A proven runtime defect requires concrete context rather than guessing beyond scope.
**Tech Stack:** Existing JS, Node20+, Playwright, installed Chromium, no dependencies added.
**Spec:** docs/superpowers/specs/2026-11-08-ci-release-design.md

## Global Constraints

- Chrome114+/Node20+, existing dependencies only; no installs or real school/profile access.
- Only tests/features.cjs plus the own task report; runtime, version, assets, permissions and IDB unchanged.
- Preserve all11 business cases and native click/cancel/stale-result assertions; no sleep or count relaxation to pass.
- Preserve real RED/failures, actual inputs/results/cleanup; original final M2 remains disclosed.

## Review Focus

- Early old requests before discover reset: prove the baseline waits actual completion.
- Transparent onclick observer: preserve this/event/Promise result and restore handler.
- Held requests: third queued old URL must never start after fresh cancellation.
- Late old results: fresh valid candidates survive, no old options reappear.
- Build scope: 35 shipped members and original ZIP SHA remain unchanged.

### Task 1: Await the correct preflight cancellation boundary

**Files:** Modify tests/features.cjs. Create only own .superpowers/sdd/2026-11-08-ci-release/task-1-report.md.
**Interfaces:** Consumes actual #discover.onclick async discover(), unchanged PPTWorkspace.cancelPreflight()/refreshSources. Produces the same11-case installed-extension features script with explicit cancellation preconditions.
- [ ] Read the named failing case/server, discover2195–2285 and queue workspace57–105; record real Linux RED4!==2 at d79d89c.
- [ ] Add exact actual-discover completion observation with original receiver/event/return and guaranteed restoration. Keep old responses held; assert no queued third URL before and after course flip, original request-count stability and fresh/no-old candidate checks.
- [ ] Preserve a deterministic old-boundary observation if practicable; do not call a passing diagnostic RED or invent Linux reproduction.
- [ ] Run one final FULL features using existing PPT_TEST_BROWSER; capture actualstdout/stderr/exit, request boundary evidence, hashes and close all owned resources. No other full local suites.
- [ ] Verify test-only scope/unchanged ZIP and commit fix; write a complete own report with limitations. Fresh independent review full task range before push/CI.
