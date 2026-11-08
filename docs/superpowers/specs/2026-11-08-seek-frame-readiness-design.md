# Native seek frame readiness

## Goal and evidence

PR12 run42470320817/headb1375dd failed library670: at the middle request, prepared video read [36,53,74,255] while the clean control read [157,36,54,255]. The exact pixel and timestamp assertions remain required. Node20 three OS and features/review/bridge/integration/memory passed; improvements was skipped. Raw log: `.test-output/ci-release-run-42470320817/remote-job.log:1176–1204`.

`scanner.js:4–19` currently resolves on seeked/readyState and immediately calls capture. A changed currentTime and a seeked event alone do not identify the frame actually readable from the video. Prove the delayed-frame gap with controlled event ordering and record one bounded native observation; do not claim the original Linux sequence was reproduced without its evidence. If evidence identifies a different owner, report NEEDS_CONTEXT before unrelated changes.

## Global Constraints

- Chrome114+/Node20+/MV3/plain JS; existing dependencies and installed isolated Chromium only. No installs, new permissions, credentials, daily profiles, host reload, or remote mutations by the implementer.
- Modify only scanner.js, tests/scanner.test.cjs, tests/library.cjs, tests/improvements.cjs, and own task report. scanner.js is the only runtime resource allowed to change; preserve the other34 release resources, version3.1.3, package/lock/dependencies/IDB3, original-source identity, persisted images/checkpoints/coverage, comparison and memory budgets. Generated package and safe release-script backups are allowed; preserve the existing canonical ZIP37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec and do not touch the unrelated main-worktree ZIP.
- Keep all existing pixel/time/encoding/source/abort/checkpoint/dedupe/retention/business assertions and fixture groups. No sleep, blind retry, weakened equality/tolerance/count, fake native pixels, target timestamps relabeled as proof, production test switches, or signature/codec/profile changes. Only make the existing synthetic Canvas seek adapter accurately implement any frame API now used by production; restore all hooks and keep its139 assertions/28 groups.
- Preserve historical qualified M2, AAC native GAP, original5 recordings/29frames, L1/L2 and platform/semantic/RSS/OS-save limits. A new runtime change invalidates old package-byte and affected-test credit: report exact epochs, rebuild and verify the actual new35-member package, then independent review and real remote CI. No claim that an old pass verifies new scanner bytes.

## Required behavior

Keep PPTScanner(video,capture,mediaContext={}) and seek(time,signal) APIs and capture(time)'s requested-time mapping. On native frame-callback capable videos, require fresh frame evidence associated with the requested seek before capture. A callback queued for the old frame must not certify a later request. Handle callback/seeked order either way, paused/same-time seeks, repeated calls and source changes without waiting forever for a frame that will never be produced. Do not impose an arbitrary fixed-FPS/mediaTime tolerance that rejects valid low/variable-frame-rate videos; retain metadata in evidence and explain the chosen correlation.

Retain the existing single30,000ms per-seek bound, source-aware seek error/time, prompt abort and late-callback protection. Cancel every owned callback, timer and event/abort listener on success, setter failure, native error, timeout and abort. Never capture, save or publish checkpoint/done after abort. Maintain bounded fallback for callers without frame-callback APIs and accurately describe its evidence; do not add a second decode pipeline or force playback/sound. Any per-scanner evidence cache must be invalidated safely and cannot retain frames or leak persistent listeners across scanner instances.

## Validation and deliverable

Controlled RED demonstrates seeked/currentTime with old pixels must not cause capture; GREEN only after the intended frame is released. Cover stale callback, both event orders, same-time paused and initial audio-only evidence, cancellation before/after events, timeout/error/setter cleanup and fallback. Keep the native clean/prepared three-slide pixels and sourceTimes assertions, plus valid black-frame behavior and corrupt-video negative control. One bounded native observation records times/frame metadata/pixels without parameter search or claiming a Linux replay.

After final code/adapter changes, run the applicable final nine repository checks serially once (npm test, release, bridge, integration, review, features, memory, library, improvements), with actual source/dependency epochs. A later fixture-only change may reuse unaffected executions only with an explicit input map; runtime changes invalidate all affected consumers. Rebuild using the existing release script; verify exactly35 entries, CRC, each payload against working/committed resources, version and SHA256. Report all failed attempts, source/report commits, raw command/stdout/stderr/numeric exits and cleanup. Final source report remains truthful even if no local original-Linux failure occurs.
