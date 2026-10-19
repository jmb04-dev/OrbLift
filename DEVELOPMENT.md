# OrbLift development

Open `index.html` in Chrome as before. Keep `game.js`, `js/`, `styles/`, and `badges/` beside it. There are no runtime dependencies, build steps, CDN requests, or module-server requirements.

For optional HTTP development, run `node tools/serve.cjs` and open `http://127.0.0.1:4173`. The development server only listens on the local machine.

## Source layout

| File                    | Responsibility                                                   |
| ----------------------- | ---------------------------------------------------------------- |
| `index.html`            | Screen markup and ordered classic script loading                 |
| `styles/game.css`       | Original neon styles, animations, mobile layout                  |
| `game.js`               | Application entry point                                          |
| `js/storage.js`         | Safe localStorage access, session fallback, parsing              |
| `js/content.js`         | Skins, backgrounds, prices, rank thresholds                      |
| `js/core.js`            | Per-instance state, initialization, frame timing, cleanup        |
| `js/gameplay.js`        | Launch, collisions, spawning, movement, timers, pause, game over |
| `js/rendering.js`       | Canvas sizing, objects, magnet field, particles, supernova       |
| `js/environment-art.js` | Domain-warped nebula textures, parallax layers, bounded cache    |
| `js/backgrounds.js`     | Twelve distinct animated scenes and cached atmospheric layers    |
| `js/progress.js`        | Career accounting, rank selection, spending                      |
| `js/ui.js`              | HUD, stats, shop, rank badges, revive offer                      |
| `js/input.js`           | Pointer/keyboard input, menus, revives, lifecycle events         |

Classic scripts register factories on the `OrbLift` namespace, preserving direct `file://` loading. `OrbLift.createGame(environment)` returns an instance with explicit `state`, storage, and methods. Rendering, gameplay, and menus share that instance instead of hidden globals. Tests use the same factories with a simulated host. Production has no test hooks or source rewriting.

`game.destroy()` cancels its animation frame and removes registered listeners and menu handlers. A future mobile host can use this when replacing a game surface. A native wrapper still needs an iOS project, signing, device validation, and release work.

## Save compatibility

Existing keys remain unchanged: `neonRushBank`, `neonRushDistanceBest`, `neonRushCareer`, `neonRushSkin`, `neonRushOwned`, `neonRushBackground`, and `neonRushOwnedBackgrounds`. Catalog IDs and rank thresholds are unchanged. Valid saves need no migration or reset.

Browser saves belong to the browser profile and origin. Keep using the same file path or HTTP origin to access that browser's progress; switching from a file to localhost does not transfer browser storage. Storage write failures fall back to session memory, but those writes cannot survive reloading until storage works again.

All 14 skins, 12 background IDs and prices, ten ranks and original badge images, speed progression, coin accounting, ten-second stacking multipliers, shields, three revive costs (100/250/600), and launch visuals are retained. Background visuals have been redesigned without changing ownership or equipment saves.

## Stability improvements

- Revives credit only new coins after each death and count one career game per run.
- Revive messages refresh after purchases change affordability.
- Purchases recheck ownership and balance when activated, preventing duplicate charges from stale handlers.
- Invalid spending amounts cannot reduce the wallet or corrupt career totals.
- Pausing or backgrounding freezes both gameplay and launch animation; resuming preserves the phase.
- Frame timing caps delayed frames and resets on visibility changes.
- Malformed saves or unavailable storage do not stop startup or gameplay.

## Automated checks

Run `node tools/check.cjs` for syntax checks on every runtime script and the complete regression suite. `node --test tests/game.test.cjs` runs just the tests. The package scripts provide equivalent `check`, `test`, and `start` commands if a package manager is available.

The tests run the actual runtime files as separate scripts in a Node VM with simulated DOM, Canvas, storage, events, and animation frames. DOM lookups are checked against the actual HTML. Coverage includes payouts across all three revives; multiplier stacking, expiry and pause; purchase/equip/reload for every cosmetic; shields and collisions; launch lifecycle; ranks and sticky menu navigation; keyboard and pointer input; resize; frame timing; listener disposal; script load order; badge assets; spawn probabilities; and independent speed/distance curves.

## Backgrounds and shop

`js/environment-art.js` gives all twelve themes distinct full-screen nebula environments, using seeded domain-warped noise, multi-octave cloud ridges, dark dust lanes, colored illumination and layered parallax. `js/backgrounds.js` retains organic signatures: Aurora curtains, solar ribbons, underwater lighting, Galaxy arms and the Eclipse corona. Grid, Matrix, Warp and Cosmic Crown replace their earlier geometric line art with violet/cyan ion clouds, emerald gas, azure currents and golden opal cloud banks. Catalog IDs, prices and ownership remain unchanged.

Scenery has an independent cosmetic clock, freezes on pause/countdown, and never consumes gameplay randomness or follows uncapped obstacle speed. Particle counts and path subdivisions are bounded, glow sprites are cached at 192×192, and Aurora gradients are rebuilt only after a relevant viewport change. Rendering never modifies progress or prices.

Every scene also has a stronger individual animation rate and secondary events: meteors, lattice pulses, expanding solar flares, bubbles, shimmering aurora filaments, drifting gas wisps, travelling circuit nodes, moving spiral arms, corona loops, tunnel shockwaves, or glowing orbital satellites. Effect counts stay fixed rather than growing with time.

Every theme additionally has its own downward falling-star layer, including themes with rising atmospheric bubbles or embers. Each uses distinct color, density, positive downward speed, trail length, and drift. Seeded stars are allocated once; each frame draws two translucent trail segments and a head per star, with 6–28 stars per scene. The same cosmetic clock freezes these on pause/countdown.

The shop has accessible Ball Skins and Backgrounds tabs, including arrow-key/Home/End navigation. Only the chosen category is displayed. Purchases and equipping retain the active tab, and both categories keep all original save keys. Background cards include scene descriptions and distinct previews.

The main menu card is the shop's only scroll container. Both item grids expand naturally with visible overflow and no height limit, so wheel/touch scrolling over cards moves the same page. The back header sticks at `top: 0` on both small and large screens, avoiding clipped buttons during scrolling.

`node tools/render-backgrounds.cjs <installed-@napi-rs/canvas-path>` optionally renders real Canvas previews to `artifacts/`. It checks that all twelve raster scenes differ and that every scene animates, then renders small-screen and landscape variants. It also produces `pickups.png` using the actual coin and power-up drawing paths. This tool is for development only and adds no game dependencies. The generated background contact sheet and pickup preview were visually inspected; this does not replace browser or physical-device performance validation.

## Gameplay balance

`OrbLift.balance` in `js/content.js` owns the tuning values. Active survival time excludes pauses and launch, and continues across revives.

- Obstacle speed starts at 500 px/s and increases without a cap: `500 + 0.35 × time`. It reaches 521 at 60 seconds, 605 at five minutes and 710 at ten minutes. The mild linear rate is far slower than the earlier quadratic acceleration. Zones do not multiply speed. Speed Rush adds at most 8%. Swept collisions remain in place, including an explicit stress test beyond configured gameplay speeds.
- Distance is independent of physical speed. Its rate is `18 + 0.45 × time + 0.006 × time²` m/s. Exact integration keeps distance consistent across frame rates. The rate is 18 m/s initially, 36.9 at 30 seconds, 66.6 at 60, and 158.4 at 120. Existing saved bests and career totals are retained.
- Spawn probabilities per event: barriers 56%, coins 34.6%, multipliers 8%, shields 1.4%. Multipliers previously had a 3.6% chance. Stacking, the 1024× cap, and the refreshing ten-second timer are unchanged.
- Primary coin spawns form five- or seven-coin trails 90% of the time. A separate stream produces five- or seven-coin curved trails and compact clusters every 0.65 seconds initially, smoothly decreasing to 0.48 seconds. Positions vary across the playfield; coins are not automatically awarded.
- Both streams use the same coin factory: coins have a 12-pixel radius (previously 10), with a 20% chance of rich-gold, two-value coins. Gold coins have a darker finish, double rim and upright “2” stamp. Their value is multiplied at collection: a gold coin at 8× pays 16. Both coin types share attraction, collision, wallet, revive settlement, and career accounting. Legacy one-value coins without a value field still work. Magnet pickups have a 21-pixel radius (previously 15); multiplier pickups have a 20-pixel radius (previously 13), with proportionally larger icons. Shared spawn checks use the actual larger radii.
- Bonus groups have a 3.5% random magnet roll at every run age, up from 1.2%. There are no guaranteed or scheduled magnets. Every proposed magnet must also pass the spacing check; the player must still collect it. Magnets activate for ten active seconds and refresh on repeat collection. Within 340 pixels coins ease into curved, accelerating pursuit. Captured coins use ordinary collection, multiplier, career, and run-wallet accounting. Pause freezes duration; expiry releases attraction; death/restart clears it.
- All new objects pass a shared spacing check against existing objects and their own group. Rotating barriers reserve their full diagonal, with extra orb-sized clearance around hazards. Twelve bounded lane attempts reposition a blocked group; if no safe placement exists, that group is skipped. Coin and magnet placement are checked separately so a blocked magnet does not discard an otherwise safe coin trail. Groups keep their patterns, and ordinary shared scrolling maintains their spacing. Magnet attraction retains its existing independent pursuit behavior.
- The large electric-blue field includes six lightning arcs, expanding pulses, eight energy curves, 18 blue particles, and coin trails. A small offscreen canvas caches the glow until viewport size or pixel ratio changes. Particle counts and trail histories are bounded. Animations freeze on pause. A magnet icon and remaining-seconds HUD appears during play.
- Tests also cover magnet reach, refresh/expiry, curved pursuit, near-field acceleration, collection at 30/60/120 fps, multiplied payouts after reviving, dense trails/clusters, glow caching, bounded effect rendering, and high-speed collisions.
- A sticky card-top back control returns from shop/stats, resumes a paused run, or returns home after game over. The home screen itself has no parent menu. Existing bottom back buttons remain available. Entering or leaving a menu resets its card scroll position.
- Revives show a neon 3–2–1 countdown before gameplay resumes. Obstacles, distance, spawns, and protection timers freeze during the countdown, while the player can reposition the orb. The full three-second safety shield starts when play resumes. Pausing/backgrounding freezes the countdown and resuming continues it without another charge.

Tests ran after storage/content/style extraction, instance/module extraction, stability repairs, and formatting. This refactor does not claim new browser or physical iPhone validation. The user confirmed the pre-refactor game works in Chrome; preview troubleshooting was stopped as requested.

## Cosmic Zones

`js/zones.js` owns run-local milestones, events, atmosphere, HUD and obstacle variants. Tune `OrbLift.cosmicSettings` in `js/content.js`: zone spacing/rewards, transition durations, rush spacing/duration/bonuses, shower timing, obstacle unlocks/chances/travel and safe path width. No storage keys or purchased cosmetic IDs changed.

Zones grow progressively longer. Zone n starts at `1000n + 250n(n−1)` meters (zero-based): 0, 1,000, 2,500, 4,500, 7,000, 10,000, 13,500, and onward. Milestone n grants `25 + 25n(n−1)/2` coins: 25, 50, 100, 175, 275, 400, etc. Rewards are not multiplied and each is recorded once through all revives in that run. Closed-form lookup and cumulative rewards handle skipped milestones without looping over past zones. New runs reset milestone tracking. Zone tint and bounded procedural effects draw after the equipped background; its animation continues intact. Difficulty scales gradually with altitude independently of the base distance integral.

Speed Rush starts every 1,500m for five active seconds, blending toward +8% obstacle speed and granting +30% distance. Boundary integration keeps distance consistent across frame rates. Random Coin Showers occur after 24–42 active seconds and last five seconds, requesting safe chevron formations. Celestial Realm adds rich-gold formations. All event timers freeze on pause/countdown and clear on death.

Moving barriers unlock at 2,000m and pulsing barriers at 3,000m, remaining available on all subsequent zones. Spawning reserves full movement travel and maximum pulse size plus rotating-square diagonal; crowded formations are skipped. Nearby barrier envelopes must leave an orb-clear corridor. Variant markings telegraph motion and maximum pulse size. These checks prevent blocked spawn rows, but still require players to steer between successive rows.

Regression coverage includes growing zone boundaries and endless naming, skipped milestone rewards, revive accounting, transitions/equipment persistence, rush timing/distance, shower patterns, obstacle unlocks/full sweeps, and sustained later-zone mobile-width spawning. The optional Canvas QA command also writes `artifacts/zones.png` with ten distinct overlays (including generated themes) over Aurora. Actual-device performance and touch playtesting remain separate from automated Canvas checks.

## Difficulty and reachable paths

Tune speed, density, pattern unlocks and movement in `OrbLift.balance` (`js/content.js`). Primary encounters use `0.3 + 0.38 × exp(−distance / 850)` seconds: 0.68 initially, about 0.511 at 500m and 0.417 at 1,000m, approaching a hard 0.3-second minimum. An encounter contains at most two barriers. No catch-up burst occurs after delays. Safe-spawn rejection can reduce actual density below this ceiling. Independent bonus coins remain available every 0.65–0.48 seconds; power-up probabilities, multipliers and wallet accounting are preserved.

Alternating left/right gap formations begin gradually after 500m, with a bounded 78% maximum pattern chance. A bounded Cosmic altitude complexity factor increases pattern variety rather than physical speed. Moving and pulsing variants retain their 2,000m/3,000m unlocks. Pattern gaps reserve full movement/pulse envelopes and stay at least 120px wide before player-clearance expansion. Narrow or crowded placements are repositioned or skipped.

The spawn planner models hazard entry/exit times using a conservative future speed bound over the remaining flight of all candidate/current objects, including the maximum rush multiplier. This bound grows with uncapped run speed, using rotating-square diagonals, maximum pulse radius, full horizontal travel and the orb radius plus an 8px margin. It propagates reachable horizontal intervals through those windows, reserves 180ms initial reaction time, and budgets only 240px/s of lateral travel. The 240px/s budget is a conservative spawn-planning allowance only. Actual pointer steering is immediate and uncapped, with no easing, acceleration, or target-following step. Corridors stay separate while a hazard crosses the orb: expansion cannot teleport a route through a barrier. Adjacent reachable intervals merge to bound planner work. Reward groups also require a reachable representative pickup and an onward route through existing hazards. The planner runs only on bounded spawn attempts, not every animation frame.

This establishes a conservative route for each accepted spawn from the player's current position; players must still steer onto that route. Arbitrary moves into existing hazards are not protected. Tests cover an open-but-unreachable alternating arrangement, its safely spaced counterpart, reaction time, reward reachability, instant uncapped movement, bounded smooth density, late-altitude speed independence, and complex formations, alongside existing mobile-width overlap stress tests.

The first five zone names and core atmospheres remain The Ascent, Ion Storm, Solar Flare, Quantum Rift and Celestial Realm. Later names combine cosmic adjectives/places with a nonrepeating sector suffix when needed. Palette hue, complementary accent, effect signature and motion vary deterministically by zone ordinal, independent of gameplay randomness. A four-entry cache bounds generated definition memory. Zones do not reset difficulty, and overlay drawing uses only current/previous themes regardless of progression depth. Background ownership, selection and unique scene animation stay unchanged.

Zone announcements occupy a 30px-high strip beside the existing top HUD, temporarily replacing the zone progress label. They show altitude, truncated zone name and coin bonus for 1.25 active seconds, fading during the final 350ms. They never intercept input; pause/death hide notices. The regular compact zone label and progress bar return afterward. Settings for initial zone length, length growth, initial reward and reward growth are grouped in `OrbLift.cosmicSettings`.

Additional tests verify exact boundaries and rewards, lookup at zone 50,000, uniqueness across 2,000 generated names/themes, no altitude-based difficulty reset, notice placement/fade and paused timing, and safe path rejection at extreme uncapped speeds. Device performance and touch playtesting remain separate from these automated checks.

## Direct pointer controls

`game.steer(x)` immediately updates the orb and its compatibility target to the clamped pointer coordinate. Runtime updates never interpolate movement. Keyboard arrows use the same immediate steering function; revive countdowns allow direct repositioning with a frozen world. Planner travel budgets do not constrain real input at any altitude or obstacle speed.

`js/input.js` captures a single primary pointer and maps viewport coordinates into canvas coordinates. Touch movement does not depend on mouse button state. Other fingers, hover, secondary mouse buttons, cancelled pointers and lost captures cannot hijack movement. Coalesced samples preserve a fast curved gesture's actual horizontal path. Pointer-up, cancellation, blur, backgrounding and teardown release the gesture. Non-passive active pointer listeners prevent default gestures; canvas `touch-action: none`, selection prevention and touch-callout suppression keep play from scrolling/selecting while shop scrolling remains available.

Each immediate drag sweeps the orb horizontally through current objects, resolving contacts in travel order. This prevents swiping through a barrier or missing a pickup between pointer events. Both pointer sweeps and the existing vertical world sweeps share one contact handler for coins, multipliers, magnets, shields, invincibility and death. Objects are removed once, and a fatal contact stops subsequent pickups in that drag. Existing wallet and revive accounting are retained.

Automated tests exercise mouse and touchscreen PointerEvents, touch events with zero buttons, capture lifecycle, multiple fingers, cancellation/blur, canvas coordinate scaling, coalesced samples, boundaries, countdown/pause behavior, immediate movement at extreme run speeds, and forward/reverse collision sweeps. These are simulated input tests; no physical touchscreen validation is claimed.

## Rich environments and input latency

Each background uses two 192×288 baked cloud layers, scaled past all screen edges so drift never exposes a flat border. Color palettes, noise fields, cloud structure and motion differ by catalog ID. A precomputed noise lattice makes cold generation fast; a two-theme cache bounds texture memory to about 0.85MiB. Once baked, each cloud frame needs only two texture blits plus 56 deterministic distant stars. No image downloads, runtime dependencies, full-screen blur filters or per-frame noise generation are used. Falling stars retain per-theme density/speed/color/trails, with parallax and cached glow sprites for near stars. Scenery pauses correctly and never consumes gameplay randomness.

On browsers exposing `pointerrawupdate`, controls use that event exclusively; others use `pointermove`. This avoids waiting for coalesced frame dispatch where raw input is available and prevents duplicate gesture processing. The orb's position still changes synchronously inside each event, without a speed limit, interpolation, acceleration or smoothing. Captured mouse/touch controls, scrolling prevention, bounds and horizontal collision sweeps remain covered by regression tests.

Denser encounters and earlier alternating patterns retain the conservative path planner. Gaps widened to 120px to reserve pickup clearance. If a broad bonus trail cannot fit, a narrow five-coin column is proposed through a recent gap, passing the same overlap and reachability checks. Rewards are never placed through hazards to meet a density target.

The real Canvas helper validates cloud color/detail in all four screen quadrants, twelve distinct animated scenes, portrait/landscape coverage and ten zone overlays. It writes `artifacts/visual-performance.json` with cold generation and warm frame timings. These are local desktop Canvas measurements, not physical-device frame-rate guarantees. The latest check measured roughly 0.5–2.5ms warm background frames; first-use texture generation is reported separately. Automated tests additionally verify texture reuse over 120 frames, bounded cache eviction, raw/fallback mouse/touch controls and increased spawn density.

## QA and optimization audit

See [QA-AUDIT.md](QA-AUDIT.md) for measured before/after CPU/raster/heap results, stress limits and explicit verification gaps. The shared simulated host lives in `tests/helpers/host.cjs`. `npm run audit:stress` runs separately disposed 150,000m games with repeated revives and 1024× multipliers; `npm run audit:benchmark` produces repeatable local host measurements. Add the installed Canvas path as documented in the report for actual raster work. These measurements are not browser/device FPS.

Collision sweeps now use the rendered rotating square with rounded orb expansion, and resolve contacts chronologically in both world and pointer motion. Resizing an active run pauses it and revalidates scaled placements. Hidden frames skip rendering; paused/countdown scenes repaint only when their visual state changes. Menu scenery still animates. Cached coin/glow artwork, offscreen culling, explicit full-canvas clearing, cached HUD nodes and dirty writes reduce hot-path work. Disposal clears textures, backing stores and listeners. Pixel comparisons and actual Canvas previews check retained visual design.

`npm run audit:browser` generates a self-contained sandboxed QA page under `artifacts/`, with in-memory saves and embedded scripts/assets. It is a development tool only. The browser audit was not completed: the user stopped Computer Use with Escape. Physical-device touch, Safari/WKWebView, GPU memory and battery validation remain outstanding.
