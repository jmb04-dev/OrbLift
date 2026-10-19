# OrbLift QA and optimization audit — 2026-10-19

83 automated regressions pass (72 existing plus 11 audit regressions). No save keys, item IDs, catalog prices, zone tuning or progression formulas changed.

## Fixes

- Rotating square barriers now use swept rounded-box/orb collision tests, including visible corners. Circle pickups retain their hitboxes. Translation is swept analytically; rotating barriers additionally check previous/current/mid-frame angles. The existing 3px orb collision forgiveness remains.
- World contacts resolve in travel order instead of reverse object-array order. Multipliers, gold coin payouts and fatal collisions are consistent when crossed within one frame.
- Orientation/viewport changes pause active play and revalidate scaled objects against screen bounds, collectible clearance and reachable routes. They release active pointer capture instead of teleporting into hazards.
- Shield HUD updates immediately when collected or broken, and hides while paused.
- Malformed development-server URLs return 400 instead of crashing the process. Traversal remains rejected. The route tests invoke the handler directly because sandbox localhost connections returned EACCES.

## Optimizations

- Cache HUD nodes and avoid unchanged text/style/ARIA writes; consolidate Cosmic HUD updates to once per simulation update. Colors use requested-value caching to account for browser CSS normalization.
- Skip hidden-tab simulation/render work and unchanged paused/countdown canvas redraws. Countdown steering, resize and equipped-cosmetic changes still trigger repaint; visible menu background animations remain.
- Cull offscreen object painting, retaining visible magnetic trails. Cache coin/glow artwork and player halo, keep circular coin sprites upright, and bound coin texture cache to eight entries. Original backgrounds, stars, magnet effects and pickup artwork remain.
- Explicitly clear the canvas before painting to discard retained native paint history. Clear cached textures, native backing stores, object arrays and listeners on disposal.
- Extract reusable test host and add repeatable CPU, raster, heap and browser-audit tools. Generated browser QA uses isolated in-memory saves and embedded assets; it never accesses the player's real localStorage.

## Measured before/after results

Node v24.19.0, Windows, same local machine. Each scenario uses 30 warm-up frames and 180 measured frames at a simulated 60Hz, fixed seeds and a 390×844 DPR1 Skia canvas with simulated DOM. A 1px readback forces raster completion each measured frame. These are standalone CPU raster workloads, **not browser/device FPS**. Corrected collisions can change later object/contact counts even with the same seed. Single-run timings include host noise and allocator/compiler effects; they are not a controlled hardware power benchmark.

| Scenario  | Mean before (ms) | Mean after (ms) | p95 before (ms) | p95 after (ms) |
| --------- | ---------------: | --------------: | --------------: | -------------: |
| normal    |           19.769 |           7.036 |          62.616 |         12.624 |
| magnet    |           39.039 |          18.173 |          83.575 |         23.172 |
| offscreen |           82.451 |           6.257 |         228.875 |          7.791 |
| paused    |            5.196 |           0.004 |           6.148 |          0.006 |
| hidden    |            6.812 |           0.003 |           8.405 |          0.004 |

In the simulated-DOM normal scenario, HUD mutations fell from 11,340 to 247 per 180 frames; DOM lookups fell from 11,340 to 0. Hidden and unchanged paused canvas passes are eliminated, rather than claiming measured battery savings.

Native normal-scenario RSS growth over 180 frames fell from 208.9 MiB to 3.2 MiB after explicit clearing. This is process RSS in the standalone Skia backend, not a measurement of browser GPU memory. Raw CPU/raster results: [before CPU](artifacts/audit-before.json), [after CPU](artifacts/audit-after.json), [before raster](artifacts/audit-canvas-before.json), [after raster](artifacts/audit-canvas-after.json).

## Stress and compatibility coverage

- Ten measured runs each reached 150,033m (1,500,330m total, 86,900 updates), with three revives and recurring 1024× multipliers/magnets each. Two extra runs warmed engine caches. Invincibility is a test-harness override so the simulation can exercise late-game behavior; it is not a real-player fairness/playability result.
- Wallet deltas, revive spending, career distance/coin totals and games played remained correct. Peak live objects: 60; peak sparks: 639. Transient effects, objects, sprite caches and listeners stayed bounded.
- Post-disposal GC heap across ten independent games changed by 37.5 KiB, with heap between 4.87 and 4.91 MiB. This shows no material retained-JS growth in this test; it is not proof of leak-free browser/GPU behavior. Raw samples: [stress audit](artifacts/stress-audit.json).
- 400 rapid zone transitions; exact milestone rewards; lookup at zone 50,000; 2,000 unique generated zone names/themes; fair full-sweep moving/pulsing barriers; dense-spawn stress across mobile widths.
- Every skin/background purchase, equip/reload, rank badge, malformed/quota-limited save, power-up expiry/pause, all three revives, pointer capture/cancellation, raw/fallback mouse/touch events, viewport scaling, instant bounds and horizontal/vertical sweep paths remain covered.
- Actual Canvas verifies all twelve backgrounds animate and contain color/detail in every quadrant, portrait/landscape layouts, ten zone overlays, and pickup art. The cached pickup comparison has a mean channel difference of 0.140/255 due to raster interpolation/glow caching; inspected artwork retains the same design.

## Still unverified

The in-app browser could not reach localhost (connection timeout). Desktop Edge exposed the existing paused file:// game, but the user stopped Computer Use with physical Escape before the isolated browser audit could run. Browser automation stopped immediately; the user's paused run and real save data were not changed. The generated page at [isolated browser audit](artifacts/browser-audit.html) is ready for a later manual run, but no automated browser pass or observed browser FPS is claimed.

Physical iPhone/iPad touch, Safari/WKWebView, real GPU memory, sustained device frame pacing, thermal throttling and battery usage remain unverified. The standalone magnet-heavy raster workload still exceeds a 16.7ms mean frame budget; do not infer guaranteed 60fps on mobile from these measurements.

## Reproduce

- `node tools/check.cjs`
- `node --expose-gc tools/stress-audit.cjs`
- `node --expose-gc tools/audit-benchmark.cjs artifacts/audit-after.json`
- `node --expose-gc tools/audit-benchmark.cjs artifacts/audit-canvas-after.json <installed-@napi-rs/canvas-path>`
- `node tools/render-backgrounds.cjs <installed-@napi-rs/canvas-path>`
- `node tools/browser-audit.cjs` then open the generated HTML and press Run browser audit.
