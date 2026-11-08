# Task 1 — native load and seek frame readiness

Status: DONE. All nine affected checks passed serially on the frozen final inputs. The canonical worktree package was rebuilt and independently verified; the old archive was safely preserved. All managed jobs were collected and test resources closed. This working report supersedes the historical HOLD record, preserved byte for byte in [hold-report.md](../../../.test-output/seek-frame-readiness/hold-report.md).

## Scope, ownership and final inputs

Original clean task BASE: `4e4e88235ad3d42d281cefdb42d48ce53690ff57`; direct pre-plan source: `b1375ddc3924237b0a2c7117a0372df783c180ce`. Controller amendment `73dc5af592a9dc08074442f499be4e5f31c32c76` added the real source-load owner and its two direct VM callers. I re-read the complete amended sole brief and binding specification before resuming. The controller's documents were not edited or staged by me. Branch: `fix/long-session-reliability` in the isolated worktree named by the brief.

Fixed-source commit: `f99a3c574b23421f5ddbbdaabff81264726ee332` (`fix: confirm video frame readiness across load and seek`). The source commit contains exactly the seven authorized paths below. The separate report commit contains only this report and is deliberately not self-referenced here.

| Changed path | Purpose | Final SHA256 |
|---|---|---|
| [scanner.js](../../../scanner.js) | Shared weak per-video presentation provenance, pre-attachment observation and bounded seek fence | `d7a92c046584c3c6f9125b5dd231e715b6af3813e27a7c394669704aa16b08e7` |
| [capture.js](../../../capture.js) | Prime immediately before all local/remote MP4 and HLS attachments; await old readiness and observed presentation; verify and dispose | `0670a0f7eaf4be16e5076709ea067fa851af074fa4002eab46006fa8e53b896a` |
| [tests/scanner.test.cjs](../../../tests/scanner.test.cjs) | Controlled pixel-order, provenance, event-order, source, failure and cleanup regressions | `c09e5ccab0fc06357df7457a6bbd13f6078323bc5d9f1cc22b66e69b479770af` |
| [tests/library.cjs](../../../tests/library.cjs) | Actual pre-src primitive in the native probe, chronology/pixels, initial paused0 and exact repeat controls | `75679583f1cef7a8b60a1599aa0f29e8955c1cd8e5011cca67375f1a9dcc3106` |
| [tests/improvements.cjs](../../../tests/improvements.cjs) | Coherent Canvas presentation callbacks and complete restoration | `9497e4f2858748a1e415054da9a4a8c9c37671ff9010a2233bd1652dcb1e4ace` |
| [tests/core.test.cjs](../../../tests/core.test.cjs) | Direct load-owner lifecycle/primary-error tests and new dependency | `842a916ab47b408c0c1139cd35663541c41700b06723165cb0c054cb7d87d294` |
| [tests/discovery.test.cjs](../../../tests/discovery.test.cjs) | Execute actual attachment helper in existing binding VM | `5020bd3e58ff79a637be0988f859ad13fa9f3ad5a7f1240cefd0ffa15de8fa68` |

No other runtime, business assertions, stencils, glyphs, versions, dependencies, IDB3 schema, permissions or source-identity rules changed. The release comparison below must preserve all other33 packaged resources. No child agents, installs, remote operations, external network, daily browser profiles or host reloads were used. Loopback-only isolated test browsers used the existing installed executable.

## Mechanism and self-review

The source owner arms `PPTScanner.prime` after asynchronous fetch/preparation and immediately before assigning src or attaching HLS. It observes the first source generation's fresh compositor submission, checks native readiness/time/counters, and removes every owned listener, timer and callback on settlement. The original loadeddata, dimensions, duration and audio-only fallback checks remain in `awaitVideo`. Before binding succeeds, the owner awaits the observation, verifies that source/generation/native time/dimensions/counters still agree, checks cancellation, and disposes in finally. The promise owns an immediate rejection handler so an earlier attachment/readiness failure does not create an orphan rejection or replace that primary failure.

Changed seeks still assign the exact requested time and capture through the existing `capture(time)` API. The fence reads back the browser's actual normalized target immediately after the setter and compares subsequent native events to that exact result. A request4/3 normalized to1.333333 remains legitimate and retains requested4/3 in capture; no FPS/proximity tolerance is used. Confirmed repeats compare the same requested label and proven native result. Completion requires seeked, usable native state at that normalized target and a presentation submitted after the request started. Either event order is accepted. A queued callback's delivery time or mediaTime label alone cannot qualify it. No fixed FPS tolerance, sleep, retry, playback nudge, codec trick or production test flag was added. The original source-aware30000ms seek deadline and45000ms load deadline remain. Without the paired frame-callback APIs the existing native-readiness fallback remains available; that fallback has weaker frame evidence.

A later scanner can reuse only an already confirmed presentation from the same weak per-video generation, exact native/requested time, paused state, dimensions and finite meaningful nondropped decode counters. Initial state/labels alone never establish that proof. New source priming supersedes the old observer; changed source, stream, time, counters, dimensions, playback or readiness prevents reuse. No images, canvases, frame arrays or permanent listeners are retained. An externally changed seek target terminates the obsolete request promptly, releases its busy owner, and never captures the replacement time under the original requested label. Legitimate seeking to the requested time remains accepted.

The existing audio-only fallback also has a negative decoder-health decision. Its optional synchronous `onSeeked` constructor callback belongs to the real load owner and executes inside the seek promise's cleanup/error boundary; the public `seek(time, signal)` API is unchanged. Finite known decoder counters can trigger the original MEDIA_NO_VIDEO load error at native seek completion, before waiting on an absent presentation. Unknown counters do not trigger that early decision. The original post-seek check remains, and generic zero-counter seeks can still wait for a later real frame. This callback supplies no positive pixel proof. The original30s/45s limits and10s invalid-video test budget are unchanged.

Controlled tests cover preabort, abort before/after either event, error, timeout, setter failure, source replacement/generation, late callbacks, first audio-only loading, paused repeats and revalidation before load completion. Self-review confirmed the original scan/save/checkpoint/disk/dedupe/learning/source assertions remain intact; native clean/prepared pixel and source-time comparisons, black positive and invalid-AVC negative were not weakened. The Canvas adapter paints the actual synthetic canvas before callback completion and restores every saved video descriptor, drawImage, pending callback and rendering request in finally. Original139 assertions/28 groups and stencils remain unchanged.

## Causal RED and native evidence

Supplied CI fact: run `42470320817`, head `b1375dd`, prepared middle pixel `[36,53,74,255]` versus clean `[157,36,54,255]`. This macOS environment has **not** reproduced that Linux scheduling failure.

Before any scanner runtime edit, controlled RED exited1: `seeked still exposes blue; red is not presented yet`, actual `[{nativeTime:4,pixel:'blue',requested:4}]`, expected `[]`. Its callback owns actual controlled pixel state; the old seeked boundary captured blue before red presentation. Exact command:

```sh
node .test-output/seek-frame-readiness/run.cjs controlled-red node --test --test-name-pattern='seeked cannot expose old pixels' tests/scanner.test.cjs
```

One corrected-filter pre-edit native observation exited0, with actual Canvas pixels and timestamps in [baseline native evidence](../../../.test-output/v3.1.3/library-Nek274/media-native.json). Clean/prepared arrays were exactly `[[36,53,74,255],[158,36,54,255],[90,103,121,255]]`; both source-time arrays were `[[0.1,0.1],[4,4],[7.9,7.9]]`. At request4, old metadata presentationTime522.1/mediaTime0.1 was delivered while nativeTime4/seekingtrue and pixels still blue. A later callback under the same metadata/currentTime read red. Pixel observation can perturb scheduling; this proves labels are insufficient, not a Linux replay.

The first fence's native original three samples were correct, but paused same-time7.9 produced no new frame and timed out. This motivated bounded confirmed-presentation reuse. Native event chronology included frame-before-seeked at4 and seeked-before-frame at0.1/7.9. A subsequent initial0 regression showed that even an already decoded paused frame can produce **no callback for30s** when observation starts after attachment: [initial owner gap](../../../.test-output/v3.1.3/library-MXBEZE/media-native.json), total4/dropped0, nativeTime0, correct blue. The callback-only entry attempt was rejected; no state-only adoption was shipped. I sent precise NEEDS_CONTEXT, held source/staging, and resumed only after the controller's amended binding scope.

Before adding the source primer, `prime-red` exited1 with `TypeError [Error]: f.Seek.prime is not a function`. After actual pre-src priming, the native initial0, exact paused repeat and original three clean/prepared pixel/time comparisons passed: [primed native evidence](../../../.test-output/v3.1.3/library-VP02Ng/media-native.json), exit0. This focused epoch precedes the final load-return verifier and is not substituted for final-byte native evidence.

The first primed final epoch passed integration, then review exposed a caller replacing nativeTime1.25 with2.5 before the coherent seek completed. The review fixture was retained. `superseded-red` exited1, `an unreachable requested time must release its busy owner immediately`, owned timer actual1/expected0. A minimal target-change guard made all52 scanner tests pass and the unmodified original review suite's identity/revisit interaction pass. This only rejects a different native target; normal own-seek event ordering remains covered.

The next frozen epoch passed its first7 checks, including all19 review groups, but library's unchanged invalid-AVC UI negative exceeded its10s `!busy()` budget. Its native initial/repeat/three-slide differential had already passed. A single bounded focused diagnostic recorded loadeddata readyState4/dimensions640×360/total0/dropped0, native seek0.1 completing at278.9ms with the same zero counters, no native error, and busy/observer still present at10s: [invalid initialization chronology](../../../.test-output/v3.1.3/library-pgbPoy/media-invalid-init.json). The strengthened positive fence had delayed the original negative decoder-health decision. `health-red` proved that delay (owned timer1 versus expected0); `fractional-red` separately proved false rejection of native1.333333/requested4/3 (timer0 versus expected1). `health-unknown-red` prevented treating absent counters as explicit zero. All failures are retained.

After the owner callback and exact native readback, actual native initial0/repeat/three-slide differential plus invalid-AVC negative and valid-black positive passed two groups in [focused native results](../../../.test-output/v3.1.3/library-XdWBYc/media-native.json). Final owner/scanner/caller controls passed111 tests. A filtered review-only attempt failed earlier at `tests/review.cjs:383:51` (`count(0)` after loading the other file); the full original review run with all preceding groups then passed19/19 in [review evidence](../../../.test-output/v3.1.3/review-2HQBRq/). This filtered failure is recorded rather than erased; it is not substituted for the required full-suite result. No review driver or budget changed.

## Raw attempts and source/fixture epochs

All executable evidence lives under [raw evidence](../../../.test-output/seek-frame-readiness/). Every prefix has `.command.json`, `.stdout`, `.stderr` and `.exit.json`; these retain exact argv/cwd/environment/start/end/source-input SHA256 and numeric exit, with full untruncated stdout/stderr. The launcher prints only a tail; raw files are complete. [Final frozen inputs](../../../.test-output/seek-frame-readiness/stable-inputs.json) and [final source diff](../../../.test-output/seek-frame-readiness/stable-source.diff) identify the release epoch. Failed epochs were preserved, including the [first primed freeze](../../../.test-output/seek-frame-readiness/primed-frozen-inputs.json), and are not final-byte credits.

| Prefix / command group | Numeric exit | Interpretation |
|---|---:|---|
| native-before | 0 | Wrong filter selected0 groups; no pass credit |
| controlled-red | 1 | Intended old-pixel RED before runtime edits |
| native-before-selected | 0 | One actual bounded pre-edit native observation |
| focused-green / focused-green-repeat / focused-green-final | 0 / 0 / 0 | 41 / 44 / 45 scanner controls at earlier fence/cache epochs |
| native-green | 1 | Original pixels correct; added same-time repeat timed out |
| native-green-repeat | 0 | Earlier confirmed-repeat native epoch; original assertions intact |
| adapter-green | 0 | Two focused Canvas/learning groups with cleanup evidence |
| final-node / final-release / final-bridge / final-integration | 0 / 0 / 0 / 1 | First frozen epoch; integration extraction wait timed out at30000ms; other5 not run |
| native-initial-red | 1 | Initial0 exposes lack of a fresh post-attachment presentation |
| focused-current-green / focused-entry-green | 0 / 0 | 46 / 47 unit controls; callback-only entry was not native-complete |
| native-entry-green | 1 | No native initial callback during30s; source-owner blocker |
| context-audit | 0 | HOLD syntax/whitespace audit; superseded |
| prime-red | 1 | Missing actual pre-src provenance primitive |
| prime-focused-green / native-primed-green / load-owner-green | 0 / 0 / 0 | 50 scanner controls / actual native group /56 direct owner-caller controls |
| primed-focused-final / freeze-check | 0 / 0 | 107 controls; first primed freeze syntax and whitespace |
| primed-final-node / release / bridge / integration / review | 0 / 0 / 0 / 0 / 1 | 361 Node,24 release, actual MP4/HLS integration passed; review target supersession exposed; remaining4 not run |
| superseded-red / superseded-green | 1 / 0 | Prompt terminal target replacement RED, then52 scanner controls GREEN |
| release-freeze-check / package-preflight | 0 / 0 | Seven syntax checks, whitespace; only intended old375 ZIP in this worktree root |
| release-final-node / release / bridge / integration / review / features / memory / library | 0 / 0 / 0 / 0 / 0 / 0 / 0 / 1 |362 Node,24 release,19 review,11 features,16 memory; invalid-AVC busy negative failed10s; improvements not run |
| invalid-init-diagnostic | 1 | Actual native prerequisite passed; unchanged invalid-video wait failed with event/state JSON |
| fractional-red / health-red / health-unknown-red | 1 / 1 / 1 | Native normalization, delayed negative health boundary, unknown-counter controls |
| health-fractional-green | 0 |110 focused scanner/core/discovery controls |
| health-native-green / health-review-green | 0 / 1 | Two actual native/black/invalid groups passed; filtered review failed earlier count0 |
| health-owner-final / health-review-full / stable-freeze | 0 / 0 / 0 |111 owner/scanner/caller controls;19 full review groups; seven syntax checks and whitespace |

Native focused command, with each fixture epoch and exact environment in its raw quartet:

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' PPT_TEST_FILTER='media native fixed AAC' node .test-output/seek-frame-readiness/run.cjs NAME node tests/library.cjs
```

All no-match literal editing attempts caused no mutation: initial library replacements, the initial0 insertion, the load-helper insertion against an assumed mediaWait signature, and the pre-src native insertion with mismatched indentation. Each was corrected against actual source. The earlier extra EOF blank line was fixed; an initial combined diff command masked that subcommand's status, so independent whitespace verification was subsequently performed. No failed test or mistaken filter was erased.

## Final serial nine-check matrix

Final command: the existing npm scripts, serially, without a filter, under `PPT_EVIDENCE_EPOCH=stable-final`. Each row has a distinct raw quartet. The complete [nine-check matrix](../../../.test-output/seek-frame-readiness/stable-final-matrix.json) and [final evidence index](../../../.test-output/seek-frame-readiness/final-evidence-index.json) retain the raw quartets, SHA inventory and identical eleven-file input maps. The serial job exited0 and was collected. All earlier successes are superseded where runtime/test inputs changed; no successful unchanged suite was speculatively repeated.

| Required command | Final numeric exit | Evidence prefix |
|---|---:|---|
| npm test | 0 | stable-final-node;365/365 tests |
| npm run test:release | 0 | stable-final-release;24/24 tests |
| npm run test:bridge | 0 | stable-final-bridge; origin/foreign-window controls |
| npm run test:integration | 0 | stable-final-integration; actual MP4/HLS/local/crop/pixel/PDF/source identity |
| npm run test:review | 0 | stable-final-review;19/19 original groups |
| npm run test:features | 0 | stable-final-features;11/11 groups |
| npm run test:memory | 0 | stable-final-memory;16/16 groups,0 browser errors |
| npm run test:library | 0 | stable-final-library;61/61 groups |
| npm run test:improvements | 0 | stable-final-improvements;28/28 groups,0 external requests |

The final source epoch uses scanner `d7a92c046584c3c6f9125b5dd231e715b6af3813e27a7c394669704aa16b08e7` and capture `0670a0f7eaf4be16e5076709ea067fa851af074fa4002eab46006fa8e53b896a`. Every final command records all seven source/test hashes plus package/lock, runner and release-builder inputs. Fixture bytes, actual ffmpeg argv/exit and native result chronology belong to each generated native evidence directory; no codec/parameter search or fixture weakening occurred.

Final native fixture epoch: [library-P8MikW](../../../.test-output/v3.1.3/library-P8MikW/media-native.json), with [actual environment](../../../.test-output/v3.1.3/library-P8MikW/environment.json) and [fixed FFmpeg argv/exits](../../../.test-output/v3.1.3/library-P8MikW/media-ffmpeg.json). Clean and prepared pixels are exactly `[[36,53,74,255],[158,36,54,255],[90,103,121,255]]`; source times are exactly `[[0.1,0.1],[4,4],[7.9,7.9]]`. The initial paused frame is blue at requested/native0; the exact7.9 repeat also passed. Every decoded native result reports pendingFrameCallbacks0. The fixture map includes AV SHA256 `05775b3790afe0c7255eda338611fcf44cbac4d05cc7317a491af2ae0ab57012` and invalid-video SHA256 `b22bfbeae4957d11a2785911392c5706226472677164266b9c850c3937bde903`; all eight fixture hashes remain in that native JSON. The [invalid initialization result](../../../.test-output/v3.1.3/library-P8MikW/media-invalid-init.json) now has busyfalse/sourceReadyfalse with zero counters; the subsequent unchanged valid-black positive passed.

Self-review exited0: [assertion inventory](../../../.test-output/seek-frame-readiness/self-review.json) confirms every original assertion line survives across all five changed test files, and the entire scan method/export tail is byte-identical to clean BASE. Static assertion-call counts are scanner122→189, library738→741, improvements153→153, core132→144 and discovery91→91; this includes the protected139 business assertions. The28 improvement groups and original glyph/stencil inputs remain unchanged. Final Canvas evidence is [canvas-Vg3K9O](../../../.test-output/learning-task-1/canvas-Vg3K9O/); all six local cleanup booleans and browser/context/server closure are true.

## Canonical package

The current release builder ran once after all nine checks: `node .test-output/seek-frame-readiness/run.cjs package-build npm run release`, exit0. The canonical [ppt-capture.zip](../../../ppt-capture.zip) now has SHA256 `fbddf1fe9e51c0724c050818b94841b056d5e3dcd93314ea29eba710485caf80`. The release script safely preserved the actual old archive as [last-release/ppt-capture-v3.1.3.zip](../../../last-release/ppt-capture-v3.1.3.zip), SHA256 `37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec`.

Independent Python standard-library validation ran as `node .test-output/seek-frame-readiness/run.cjs package-independent python3 .test-output/seek-frame-readiness/verify-package.py`, exit0. It checked exactly35 unique expected members, every decompressed payload against the current source, each individual CRC32 and SHA256, ZIP integrity, all five3.1.3 version fields, the old backup's35 CRC/payloads against baseline, and all eleven frozen source/input hashes. Only scanner/capture payloads differ; the other33 resources are byte-identical. The complete35-member CRC/size/SHA/source-equality table and verified backup are in [package-validation.json](../../../.test-output/seek-frame-readiness/package-validation.json); original hashes are in [baseline.json](../../../.test-output/seek-frame-readiness/baseline.json).

Only this isolated worktree's canonical ZIP was rebuilt; the unrelated main-worktree ZIP was not touched. The old375 archive and older f982-dependent GREEN claims are superseded for changed runtime bytes.

## Environment, limits and cleanup

Environment: Node26.13.0, macOS/darwin arm64, Playwright1.62.1, isolated Chromium156.0.8078.4. The installed executable is recorded in every browser command/environment JSON. Native encoding remains the fixed20fps/libx264/yuv420p/g20/bf0/AAC fixture. Native pixels are actually read; callback/nativeTime labels are not treated as pixel proof. AAC classification remains explicit `browser-tolerates-damaged-audio` on this browser. Linux CI timing, background-tab callback delivery, arbitrary sparse/VFR recordings, other browser engines and OS save behavior are not newly qualified. Sparse/VFR samples are not rejected using an invented FPS tolerance; an absent presentation remains bounded by the existing deadline. The historical M2 qualified wording, original5 recordings/29frames, L1/L2, semantic correctness and process/RSS limitations remain historical qualifications, not new achievements.

All focused native callbacks reached pending0 and their overrides were restored; probes detach media/revoke URLs. Canvas focus evidence reported videoRestored/callbacksReleased/drawImageRestored/dedupeReleased/reviewClosed/sourceReleased and browser/context/server closure true. Runtime unit tests verify settlement cleanup and late-callback suppression. Test runners own finally cleanup of media, contexts, browser and loopback server. All15 managed jobs across the original and amended phases were completed and collected, including the final serial job `bash-56fac2ac3ab1461b` (exit0); the final job inventory has no running job. All media observers/callbacks/listeners/timers owned by this change are disposed on settlement, and isolated runner contexts/browser/servers close in finally. No Brave MCP task was opened.
