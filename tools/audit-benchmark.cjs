// Reproducible simulated-host CPU/DOM benchmark; optional real Canvas backend.
// Run before/after with the same runtime and --expose-gc. This is not browser FPS.
const fs = require("node:fs");
const { boot } = require("../tests/helpers/host.cjs");
const output = process.argv[2] || "artifacts/audit-benchmark.json";
const canvasModule = process.argv[3];
const createCanvas = canvasModule ? require(canvasModule).createCanvas : null;
const results = {
  runtime: process.version,
  platform: process.platform,
  backend: createCanvas
    ? "Skia Canvas + simulated DOM"
    : "simulated Canvas/DOM",
  scenarios: [],
};
const memory = () => {
  global.gc?.();
  return process.memoryUsage();
};
for (const scenario of ["normal", "magnet", "offscreen", "paused", "hidden"]) {
  const options = createCanvas
    ? {
        width: 390,
        height: 844,
        dpr: 1,
        canvas: createCanvas(390, 844),
        createCanvas: () => createCanvas(192, 192),
      }
    : {};
  const host = boot({}, false, false, options),
    { game, sandbox, metrics, tick, document } = host;
  sandbox.Math = Object.create(Math);
  let seed = 1234;
  sandbox.Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  game.start();
  game.state.mode = "play";
  game.state.invincible = 1e6;
  if (scenario === "magnet") {
    game.state.magnet = 1e6;
    game.state.coinBoost = 1e6;
    game.state.coinMultiplier = 32;
  }
  if (scenario === "offscreen") {
    game.state.objects = Array.from({ length: 60 }, (_, i) => ({
      ...game.createCoin(40 + (i % 5) * 50, -300 - i * 37),
      angle: 0.2,
    }));
  }
  if (scenario === "paused") game.toggle();
  if (scenario === "hidden") {
    document.hidden = true;
    host.events.visibilitychange();
  }
  for (let frame = 0; frame < 30; frame++) {
    tick(1000 + (frame * 1000) / 60);
    if (createCanvas) game.g.getImageData(0, 0, 1, 1);
  }
  const startMemory = memory(),
    before = { ...metrics },
    times = [];
  for (let frame = 30; frame < 210; frame++) {
    const start = performance.now();
    tick(1000 + (frame * 1000) / 60);
    if (createCanvas) game.g.getImageData(0, 0, 1, 1); // Flush deferred raster work before measuring completion/memory.
    times.push(performance.now() - start);
  }
  const endMemory = memory();
  times.sort((a, b) => a - b);
  results.scenarios.push({
    name: scenario,
    frames: times.length,
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    p95Ms: times[Math.floor(times.length * 0.95)],
    maxMs: times.at(-1),
    metrics: Object.fromEntries(
      Object.keys(metrics).map((key) => [key, metrics[key] - before[key]]),
    ),
    heapDeltaBytes: endMemory.heapUsed - startMemory.heapUsed,
    rssDeltaBytes: endMemory.rss - startMemory.rss,
    objects: game.state.objects.length,
    sparks: game.state.sparks.length,
  });
  game.destroy();
}
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(output, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
