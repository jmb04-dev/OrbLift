// Extended deterministic gameplay and post-disposal JS heap sampling.
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { boot } = require("../tests/helpers/host.cjs");
function run(seed) {
  const host = boot({ neonRushBank: "1000000" }),
    { game, sandbox, e } = host;
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  game.start();
  game.state.mode = "play";
  game.state.invincible = 1e6;
  let frames = 0,
    objects = 0,
    sparks = 0,
    revives = 0;
  while (game.state.distance < 150000) {
    if (frames % 300 === 0) {
      for (let index = 0; index < 12; index++)
        game.resolveContact({
          kind: "multiplier",
          x: game.state.ball.x,
          y: game.state.ball.y,
        });
      game.resolveContact({
        kind: "magnet",
        x: game.state.ball.x,
        y: game.state.ball.y,
      });
    }
    game.update(0.04);
    frames++;
    objects = Math.max(objects, game.state.objects.length);
    sparks = Math.max(sparks, game.state.sparks.length);
    if (revives < 3 && game.state.distance >= [10000, 50000, 100000][revives]) {
      game.end();
      e("revive").onclick();
      game.update(3);
      game.state.invincible = 1e6;
      revives++;
    }
  }
  game.end();
  assert.equal(game.state.bank, 1000000 + game.state.runCoins - 950);
  assert.equal(
    game.state.career.totalDistance,
    Math.floor(game.state.distance),
  );
  assert.equal(game.state.career.gamesPlayed, 1);
  const summary = {
    frames,
    distance: Math.floor(game.state.distance),
    zones: game.zoneAt().index,
    revives,
    peakObjects: objects,
    peakSparks: sparks,
    earned: game.state.runCoins,
  };
  game.destroy();
  assert.equal(Object.keys(host.events).length, 0);
  return summary;
}
run(1);
run(2);
const samples = [];
for (let index = 0; index < 10; index++) {
  const start = performance.now(),
    summary = run(7919 + index);
  global.gc?.();
  const memory = process.memoryUsage();
  samples.push({
    ...summary,
    wallMs: performance.now() - start,
    heapUsed: memory.heapUsed,
    rss: memory.rss,
  });
}
const result = {
  runtime: process.version,
  gcAvailable: !!global.gc,
  simulation:
    "10 separately disposed 150,000m games; 3 revives and stacked 32x power-ups each",
  samples,
  retainedHeapChangeBytes: samples.at(-1).heapUsed - samples[0].heapUsed,
};
fs.writeFileSync(
  "artifacts/stress-audit.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
