const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { boot, scripts } = require("./helpers/host.cjs");

test("revives credit only newly earned coins and count one career game", () => {
  const { game: g, e } = boot({ neonRushBank: "2000" });
  g.start();
  g.set({ mode: "play", distance: 100 });
  g.collect("coin");
  g.end();
  assert.equal(g.state.bank, 2001);
  for (const price of [100, 250, 600]) {
    const before = g.state.bank;
    e("revive").onclick();
    assert.equal(g.state.bank, before - price);
    g.update(3);
    g.set({ distance: g.state.career.totalDistance + 50 });
    g.collect("coin");
    g.end();
    assert.equal(g.state.bank, before - price + 1);
  }
  assert.equal(g.state.career.gamesPlayed, 1);
  assert.equal(g.state.career.totalCoinsEarned, 4);
  assert.equal(g.state.career.totalCoinsSpent, 950);
  assert.equal(g.state.career.totalDistance, 250);
  assert.equal(e("revive").disabled, true);
  const bank = g.state.bank;
  g.end();
  assert.equal(g.state.bank, bank);
});
test("multiplier stacks, refreshes, expires, and clears after death", () => {
  const { game: g, e } = boot();
  g.add = g.addCoinBonus = () => {};
  g.start();
  g.set({ mode: "play" });
  g.collect("multiplier");
  g.collect("multiplier");
  assert.equal(g.state.coinMultiplier, 4);
  assert.equal(e("coinRate").textContent, "4×");
  g.collect("coin");
  assert.equal(g.state.runCoins, 4);
  g.update(5);
  g.collect("multiplier");
  assert.equal(g.state.coinBoost, 10);
  assert.equal(g.state.coinMultiplier, 8);
  g.update(10);
  assert.equal(g.state.coinMultiplier, 1);
  g.collect("multiplier");
  g.end();
  assert.equal(e("multiplierBanner").style.display, "none");
  assert.equal(e("coinRate").textContent, "1×");
});
test("legacy progress survives reload; purchases and equipment persist", () => {
  const saved = {
    neonRushBank: "1000",
    neonRushCareer: JSON.stringify({ totalDistance: 5000, gamesPlayed: 3 }),
  };
  const { game: g, e } = boot(saved);
  g.renderShop();
  e("shopGrid").children[1].onclick();
  assert.equal(g.state.bank, 650);
  assert.equal(g.state.skin, "cyan");
  g.renderShop();
  e("backgroundGrid").children[1].onclick();
  const reloaded = boot(saved).game;
  assert.equal(reloaded.state.skin, "cyan");
  assert.equal(reloaded.state.background, "stars");
  assert.equal(reloaded.state.bank, 50);
  assert.equal(reloaded.state.career.totalDistance, 5000);
  assert.equal(reloaded.state.career.gamesPlayed, 3);
});
test("malformed saves, invalid equipment, and unavailable storage do not crash", () => {
  for (const broken of [false, true]) {
    const { game: g } = boot(
      {
        neonRushOwned: "{bad",
        neonRushOwnedBackgrounds: "null",
        neonRushSkin: "missing",
        neonRushCareer: "{",
        neonRushBank: "NaN",
      },
      broken,
    );
    assert.equal(g.state.bank, 0);
    assert.equal(g.state.skin, "pink");
    g.start();
    g.set({ mode: "play" });
    g.collect("coin");
    g.draw(0);
    g.end();
    g.renderStats();
    assert.equal(g.state.bank, 1);
  }
});
test("all cosmetic rendering paths and badge assets are valid", () => {
  const { game: g } = boot();
  g.start();
  g.drawLaunch(0.5);
  g.set({ mode: "play" });
  for (const background of [
    "void",
    "stars",
    "grid",
    "embers",
    "ocean",
    "aurora",
    "nebula",
    "matrix",
    "galaxy",
    "eclipse",
    "warp",
    "cosmic",
  ]) {
    g.set({ background });
    g.draw(0.016);
  }
  for (const name of [
    "novice",
    "rookie",
    "runner",
    "challenger",
    "elite",
    "master",
    "champion",
    "legend",
    "mythic",
    "ascendant",
  ]) {
    const png = fs.readFileSync(`badges/${name}.png`);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok(png.readUInt32BE(16) > 0);
  }
});
test("backgrounding pauses a live run and hides multiplier", () => {
  const { game: g, document, events, e } = boot();
  g.start();
  g.set({ mode: "play" });
  g.collect("multiplier");
  document.hidden = true;
  events.visibilitychange();
  assert.equal(g.state.mode, "paused");
  assert.equal(e("multiplierBanner").style.display, "none");
});

test("launch animation completes; pausing freezes gameplay and boost timers", () => {
  const { game: g, e } = boot();
  e("start").onclick();
  assert.equal(g.state.launchParticles.length, 105);
  g.drawLaunch(0.95);
  assert.equal(g.state.mode, "play");
  g.collect("multiplier");
  g.update(0.5);
  const before = { distance: g.state.distance, boost: g.state.coinBoost };
  e("pause").onclick();
  g.update(5);
  assert.equal(g.state.distance, before.distance);
  assert.equal(g.state.coinBoost, before.boost);
  e("start").onclick();
  assert.equal(g.state.mode, "play");
  assert.equal(e("multiplierBanner").style.display, "block");
});

test("launch pauses on backgrounding and resumes its animation", () => {
  const { game: g, document, events, e } = boot();
  g.start();
  g.drawLaunch(0.3);
  document.hidden = true;
  events.visibilitychange();
  assert.equal(g.state.mode, "paused");
  g.drawLaunch(1);
  assert.equal(g.state.launchElapsed, 0.3);
  e("start").onclick();
  assert.equal(g.state.mode, "launch");
  g.drawLaunch(0.7);
  assert.equal(g.state.mode, "play");
});

test("shield absorbs one collision; revive shield protects until expiry", () => {
  const { game: g, e } = boot({ neonRushBank: "1000" });
  g.add = g.addCoinBonus = () => {};
  g.start();
  g.set({ mode: "play" });
  g.collect("shield");
  g.collect("barrier");
  assert.equal(g.state.mode, "play");
  assert.equal(g.state.shield, 0);
  g.collect("barrier");
  assert.equal(g.state.mode, "over");
  e("revive").onclick();
  assert.equal(g.state.mode, "countdown");
  g.update(3);
  g.collect("barrier");
  assert.equal(g.state.mode, "play");
  g.set({ objects: [] });
  g.update(3);
  g.collect("barrier");
  assert.equal(g.state.mode, "over");
  assert.equal(g.state.career.gamesPlayed, 1);
});

test("shop back refreshes revive affordability; purchases cannot repeat or overspend", () => {
  const { game: g, e } = boot({ neonRushBank: "440" });
  g.start();
  g.set({ mode: "play" });
  g.end();
  e("openShop").onclick();
  const button = e("shopGrid").children[1];
  button.onclick();
  button.onclick();
  assert.equal(g.state.bank, 90);
  assert.equal(g.state.career.totalCoinsSpent, 350);
  e("menuBack").onclick();
  assert.equal(e("revive").disabled, true);
  assert.equal(e("reviveText").textContent, "Need 10 more coins to revive.");
  for (const amount of [-1, NaN, Infinity, 1.5, 1000])
    assert.equal(g.spendCoins(amount), false);
  assert.equal(g.state.bank, 90);
});

test("all ranks use the original thresholds and stats can return to paused run", () => {
  const { game: g, e } = boot();
  const thresholds = [
    0, 1000, 5000, 15000, 35000, 75000, 150000, 300000, 600000, 1000000,
  ];
  const names = [
    "Novice",
    "Rookie",
    "Runner",
    "Challenger",
    "Elite",
    "Master",
    "Champion",
    "Legend",
    "Mythic",
    "Ascendant",
  ];
  thresholds.forEach((value, index) => {
    g.state.career.totalDistance = value;
    assert.equal(g.rank().name, names[index]);
    g.renderStats();
    assert.ok(e("statsRank").innerHTML.includes(names[index].toUpperCase()));
  });
  assert.equal(e("statsFill").style.width, "100%");
  g.start();
  g.set({ mode: "play" });
  g.toggle();
  e("openStats").onclick();
  e("menuBack").onclick();
  assert.equal(g.state.mode, "paused");
  e("start").onclick();
  assert.equal(g.state.mode, "play");
});

test("frame loop limits long delays, resize clamps the player, destroy removes listeners", () => {
  const { game: g, tick, sandbox, events, e } = boot();
  g.start();
  g.drawLaunch(1);
  tick(1000);
  const before = g.state.distance;
  tick(61000);
  assert.ok(g.state.distance - before < 2);
  sandbox.innerWidth = 280;
  events.resize();
  assert.ok(g.state.ball.x >= 24 && g.state.ball.x <= 256);
  assert.equal(g.c.width, 560);
  g.destroy();
  assert.equal(Object.keys(events).length, 0);
  assert.equal(e("start").onclick, null);
});

test("HTML loads every script separately in order and references existing assets", () => {
  assert.equal(scripts.at(-1), "game.js");
  assert.equal(scripts.length, 13);
  const sandbox = {};
  vm.createContext(sandbox);
  for (const file of scripts.slice(0, -1))
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  const html = fs.readFileSync("index.html", "utf8");
  for (const [, href] of html.matchAll(/href="([^"]+)"/g))
    assert.ok(fs.existsSync(href));
});

test("all 14 skins and 12 backgrounds purchase, equip, and reload without repeat charges", () => {
  const saved = { neonRushBank: "2000000" };
  const { game, e } = boot(saved);
  let spent = 0;
  for (const [grid, count, costs] of [
    [
      "shopGrid",
      14,
      [
        0,350,900,1800,3500,6500,10000,15000,22000,32000,46000,65000,90000,125000,
      ],
    ],
    [
      "backgroundGrid",
      12,
      [0,600,1600,3500,7000,12000,20000,32000,50000,75000,110000,160000],
    ],
  ]) {
    game.renderShop();
    assert.equal(e(grid).children.length, count);
    for (let index = 1; index < count; index++) {
      e(grid).children[index].onclick();
      spent += costs[index];
      assert.equal(game.state.bank, 2000000 - spent);
      assert.equal(e(grid).children[index].disabled, true);
    }
    for (let index = 0; index < count; index++)
      e(grid).children[index].onclick();
    assert.equal(game.state.bank, 2000000 - spent);
  }
  const reloaded = boot(saved).game;
  assert.equal(reloaded.state.owned.length, 14);
  assert.equal(reloaded.state.ownedBackgrounds.length, 12);
  assert.equal(reloaded.state.skin, "shadow");
  assert.equal(reloaded.state.background, "cosmic");
  assert.equal(reloaded.state.career.totalCoinsSpent, spent);
});

test("keyboard steering works after start button focus and pointer drag stays in bounds", () => {
  const { game, events, e } = boot();
  e("start").onclick();
  game.drawLaunch(1);
  const before = game.state.ball.target;
  events.keydown({
    key: "ArrowLeft",
    target: { closest: () => ({}) },
    preventDefault() {},
  });
  assert.equal(game.state.ball.target, before - 55);
  events.pointerdown({ pointerId: 1, clientX: -500 });
  assert.equal(game.state.ball.target, 21);
  events.pointermove({ buttons: 1, clientX: 10000 });
  assert.equal(game.state.ball.target, game.state.w - 21);
});

test("existing readable progress survives quota failures and stays usable in session", () => {
  const saved = {
    neonRushBank: "500",
    neonRushSkin: "cyan",
    neonRushOwned: '["pink","cyan"]',
  };
  const { game, e } = boot(saved, true);
  assert.equal(game.state.skin, "cyan");
  game.renderShop();
  e("shopGrid").children[2].onclick();
  assert.equal(game.state.bank, 360);
  assert.equal(game.state.skin, "violet");
  assert.equal(saved.neonRushBank, "500");
  assert.equal(game.storage.safeStorage.getItem("neonRushBank"), "360");
});

test("top navigation returns from every submenu, resumes pause, and returns home after death", () => {
  const { game, e } = boot({ neonRushBank: "1000" });
  for (const menu of ["openShop", "openStats"]) {
    e("menuCard").scrollTop = 500;
    e(menu).onclick();
    assert.equal(e("menuNav").style.display, "flex");
    assert.equal(e("menuCard").scrollTop, 0);
    e("menuBack").onclick();
    assert.equal(e("mainActions").style.display, "block");
    assert.equal(e("menuNav").style.display, "none");
  }
  game.start();
  game.drawLaunch(1);
  game.toggle();
  assert.equal(e("menuBack").textContent, "← RESUME RUN");
  e("openShop").onclick();
  e("menuBack").onclick();
  assert.equal(game.state.mode, "paused");
  e("menuBack").onclick();
  assert.equal(game.state.mode, "play");
  game.collect("coin");
  game.end();
  e("openStats").onclick();
  e("menuBack").onclick();
  assert.equal(e("reviveArea").style.display, "block");
  assert.equal(e("menuBack").textContent, "← MAIN MENU");
  const balance = game.state.bank;
  e("menuBack").onclick();
  assert.equal(game.state.mode, "menu");
  assert.equal(game.state.bank, balance);
  assert.equal(e("reviveArea").style.display, "none");
  const html = fs.readFileSync("index.html", "utf8");
  assert.ok(html.indexOf('id="menuBack"') < html.indexOf('id="shopArea"'));
  assert.match(
    fs.readFileSync("styles/game.css", "utf8"),
    /\.menu-nav\s*\{[^}]*position:\s*sticky/,
  );
});

test("fast opening speed grows mildly without a ceiling", () => {
  const { game } = boot();
  game.start();
  assert.equal(game.state.speed, 500);
  assert.equal(game.obstacleSpeedAt(0), 500);
  assert.ok(game.obstacleSpeedAt(30) > 500 && game.obstacleSpeedAt(30) < 520);
  let previous = 500;
  for (let second = 1; second <= 600; second++) {
    const speed = game.obstacleSpeedAt(second);
    assert.ok(Number.isFinite(speed) && speed > previous);
    assert.ok(
      speed - previous < previous * 0.04,
      "No sudden relative speed jumps",
    );
    previous = speed;
  }
  assert.ok(game.obstacleSpeedAt(60) < 540);
  assert.ok(game.obstacleSpeedAt(600) < 740);
  assert.equal(game.obstacleSpeedAt(1e9), 500 + 0.35 * 1e9);
  assert.equal(game.obstacleSpeedAt(3600), 1760);
  assert.ok(
    Math.abs(game.obstacleSpeedAt(120) - game.obstacleSpeedAt(119) - 0.35) <
      1e-9,
  );
});

test("distance is independent of obstacle speed, accelerates progressively, and integrates across frame rates", () => {
  function simulation(speed, step) {
    const { game } = boot();
    game.start();
    game.drawLaunch(1);
    game.add = () => {};
    game.obstacleSpeedAt = () => speed;
    for (let frame = 0; frame < Math.round(60 / step); frame++)
      game.update(step);
    return game;
  }
  const slow = simulation(275, 1 / 30),
    fast = simulation(900, 1 / 60);
  assert.ok(Math.abs(slow.state.distance - fast.state.distance) < 1e-7);
  assert.ok(
    fast.state.distance > 2322,
    "Speed Rush adds distance independently of obstacle speed",
  );
  assert.equal(fast.distanceAt(60), 2322);
  const { game } = boot();
  assert.ok(
    game.distanceAt(1) < 31.25,
    "Slower initial distance than the original game",
  );
  const gains = [0, 30, 60, 120].map(
    (time) => game.distanceAt(time + 1) - game.distanceAt(time),
  );
  assert.ok(gains[0] < gains[1] && gains[1] < gains[2] && gains[2] < gains[3]);
  assert.ok(gains[3] - gains[2] > gains[2] - gains[1]);
});

test("multiplier spawn chance increases without increasing barriers or reducing shields", () => {
  const { game, sandbox } = boot();
  sandbox.Math = Object.create(Math);
  const counts = { barrier: 0, coin: 0, multiplier: 0, shield: 0 };
  for (let index = 0; index < 10000; index++) {
    sandbox.Math.random = () => (index + 0.5) / 10000;
    game.state.objects = [];
    game.add();
    counts[game.state.objects[0].kind]++;
  }
  assert.deepEqual(counts, {
    barrier: 5600,
    coin: 3460,
    multiplier: 800,
    shield: 140,
  });
});

test("revive counts down 3, 2, 1 with a frozen world and full protection on resume", () => {
  const { game, e, events } = boot({ neonRushBank: "1000" });
  game.start();
  game.drawLaunch(1);
  game.end();
  e("revive").onclick();
  assert.equal(game.state.mode, "countdown");
  assert.equal(e("reviveCountdownValue").textContent, "3");
  assert.equal(e("reviveCountdown").style.display, "flex");
  const bank = game.state.bank;
  e("revive").onclick();
  assert.equal(game.state.bank, bank);
  const before = {
    time: game.state.time,
    distance: game.state.distance,
    spawn: game.state.spawn,
  };
  const coin = { kind: "coin", x: 40, y: 100, r: 10, angle: 0, spin: 2 };
  game.state.objects = [coin];
  events.pointerdown({ pointerId: 1, clientX: 60 });
  game.update(1);
  assert.equal(e("reviveCountdownValue").textContent, "2");
  game.update(1);
  assert.equal(e("reviveCountdownValue").textContent, "1");
  assert.equal(game.state.mode, "countdown");
  assert.equal(coin.y, 100);
  assert.equal(game.state.ball.x, 60);
  assert.equal(game.state.time, before.time);
  assert.equal(game.state.distance, before.distance);
  assert.equal(game.state.spawn, before.spawn);
  assert.equal(game.state.invincible, 3);
  game.draw(0);
  game.update(1);
  assert.equal(game.state.mode, "play");
  assert.equal(e("reviveCountdown").style.display, "none");
  assert.equal(game.state.invincible, 3);
  game.update(0.1);
  assert.ok(game.state.distance > before.distance);
  assert.equal(game.state.invincible, 2.9);
});

test("backgrounding freezes a revive countdown and resume continues without another charge", () => {
  const { game, e, document, events } = boot({ neonRushBank: "1000" });
  game.start();
  game.drawLaunch(1);
  game.end();
  e("revive").onclick();
  game.update(1);
  document.hidden = true;
  events.visibilitychange();
  assert.equal(game.state.mode, "paused");
  assert.equal(e("reviveCountdown").style.display, "none");
  game.update(5);
  assert.equal(game.state.reviveCountdown, 2);
  e("menuBack").onclick();
  assert.equal(game.state.mode, "countdown");
  assert.equal(e("reviveCountdownValue").textContent, "2");
  game.update(2);
  assert.equal(game.state.mode, "play");
  assert.equal(game.state.bank, 900);
  assert.equal(game.state.invincible, 3);
});

test("magnet lasts ten active seconds, refreshes, pauses, expires, and clears on death", () => {
  const { game, e } = boot();
  game.start();
  game.drawLaunch(1);
  game.add = game.addCoinBonus = () => {};
  game.collect("magnet");
  assert.equal(game.state.magnet, 10);
  assert.equal(e("magnetHUD").style.display, "flex");
  assert.equal(e("magnetTimer").textContent, "10s");
  game.update(4);
  assert.equal(game.state.magnet, 6);
  game.collect("magnet");
  assert.equal(game.state.magnet, 10);
  game.toggle();
  game.update(20);
  assert.equal(game.state.magnet, 10);
  assert.equal(e("magnetHUD").style.display, "none");
  game.toggle();
  assert.equal(e("magnetHUD").style.display, "flex");
  game.update(10);
  assert.equal(game.state.magnet, 0);
  assert.equal(e("magnetHUD").style.display, "none");
  game.collect("magnet");
  game.end();
  assert.equal(game.state.magnet, 0);
  assert.equal(e("magnetHUD").style.display, "none");
  game.start();
  assert.equal(game.state.magnet, 0);
});

test("attracted coins visibly turn toward the orb and pay every multiplier exactly once", () => {
  for (const multiplier of [1, 2, 4, 8, 16, 32]) {
    const { game } = boot();
    game.start();
    game.drawLaunch(1);
    game.add = game.addCoinBonus = () => {};
    game.collect("magnet");
    game.state.coinMultiplier = multiplier;
    game.state.coinBoost = 10;
    const { ball } = game.state;
    const coin = {
      kind: "coin",
      x: ball.x + 100,
      y: ball.y + 60,
      r: 10,
      angle: 0,
      spin: 2,
    };
    game.state.objects = [coin];
    const initialY = coin.y;
    game.update(1 / 60);
    assert.ok(coin.x < ball.x + 100);
    assert.ok(
      coin.y > initialY,
      "Initial downward momentum curves into the attraction",
    );
    for (let step = 0; step < 120 && game.state.objects.length; step++)
      game.update(1 / 60);
    assert.equal(game.state.objects.length, 0);
    assert.equal(game.state.runCoins, multiplier);
    assert.ok(coin.y < initialY);
    assert.equal(game.state.bank, 0);
    game.update(1 / 60);
    assert.equal(game.state.runCoins, multiplier);
    game.end();
    assert.equal(game.state.bank, multiplier);
    assert.equal(game.state.career.totalCoinsEarned, multiplier);
  }
});

test("magnet attraction strengthens nearby, respects range, and releases on expiry", () => {
  const { game } = boot();
  game.start();
  game.drawLaunch(1);
  game.state.magnet = 10;
  const { ball } = game.state;
  const coin = (distance) => ({
    kind: "coin",
    x: ball.x + distance,
    y: ball.y,
    r: 10,
    angle: 0,
    spin: 2,
    magnetVx: 0,
    magnetVy: 0,
  });
  const far = coin(280),
    near = coin(55),
    outside = coin(360);
  game.moveCoin(far, 1 / 60);
  game.moveCoin(near, 1 / 60);
  game.moveCoin(outside, 1 / 60);
  assert.ok(Math.abs(near.magnetVx) > Math.abs(far.magnetVx));
  assert.equal(outside.x, ball.x + 360);
  assert.equal(outside.magnetized, false);
  for (let step = 0; step < 20; step++) game.moveCoin(far, 1 / 60);
  assert.ok(far.trail.length <= 6);
  assert.ok(far.trail.length > 1);
  game.state.magnet = 0;
  const x = far.x,
    y = far.y;
  game.moveCoin(far, 0.01);
  assert.equal(far.x, x);
  assert.equal(far.y, y + game.state.speed * 0.01);
  assert.equal(far.magnetized, false);
  assert.equal(far.trail.length, 0);
});

test("coin attraction collects consistently at 30, 60 and 120 fps while other objects are unaffected", () => {
  for (const fps of [30, 60, 120]) {
    const { game } = boot();
    game.start();
    game.drawLaunch(1);
    game.collect("magnet");
    game.add = game.addCoinBonus = () => {};
    const coin = {
      kind: "coin",
      x: game.state.ball.x - 110,
      y: game.state.ball.y - 65,
      r: 10,
      angle: 0,
      spin: 2,
    };
    const obstacle = {
      kind: "barrier",
      x: 20,
      y: 30,
      r: 20,
      angle: 0,
      spin: 1,
    };
    game.state.objects = [coin, obstacle];
    game.update(1 / fps);
    assert.equal(obstacle.x, 20);
    assert.ok(Math.abs(obstacle.y - (30 + game.state.speed / fps)) < 1e-9);
    for (let frame = 1; frame < fps * 2 && game.state.runCoins === 0; frame++)
      game.update(1 / fps);
    assert.equal(game.state.runCoins, 1);
    assert.equal(game.state.mode, "play");
  }
});

test("magnet field, energy lines, trails and pickup render; animation freezes while paused", () => {
  const { game } = boot();
  game.start();
  game.drawLaunch(1);
  game.collect("magnet");
  let lines = [];
  game.g.quadraticCurveTo = (...points) => lines.push(points);
  game.draw(0);
  assert.equal(lines.length, 8);
  const initial = JSON.stringify(lines);
  game.state.time += 0.25;
  lines = [];
  game.draw(0);
  assert.notEqual(JSON.stringify(lines), initial);
  game.toggle();
  const time = game.state.time;
  game.update(1);
  assert.equal(game.state.time, time);
  const coin = {
    kind: "coin",
    x: game.state.ball.x + 70,
    y: game.state.ball.y - 70,
    r: 10,
    angle: 0,
    spin: 2,
  };
  game.toggle();
  game.state.objects = [
    coin,
    { kind: "magnet", x: 20, y: 40, r: 15, angle: 0, spin: 0.35 },
  ];
  game.moveCoin(coin, 0.016);
  game.moveCoin(coin, 0.016);
  game.draw(0);
  game.state.magnet = 0;
  lines = [];
  game.draw(0);
  assert.equal(lines.length, 0);
});

test("bonus coins and magnets add rewards without replacing primary obstacle spawns", () => {
  const { game, sandbox } = boot();
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => 0.6;
  game.add();
  assert.equal(game.state.objects.length, 7);
  assert.ok(game.state.objects.every((object) => object.kind === "coin"));
  game.state.objects = [];
  sandbox.Math.random = () => 0.001;
  game.addCoinBonus();
  assert.equal(
    game.state.objects.filter((object) => object.kind === "coin").length,
    5,
  );
  assert.equal(
    game.state.objects.filter((object) => object.kind === "magnet").length,
    1,
  );
  for (const object of game.state.objects)
    assert.ok(object.x >= 24 && object.x <= game.state.w - 24);
  game.state.objects = [];
  game.start();
  game.drawLaunch(1);
  let primary = 0,
    bonuses = 0;
  game.add = () => primary++;
  game.addCoinBonus = () => bonuses++;
  for (let step = 0; step < 40; step++) game.update(0.1);
  assert.ok(primary >= 4);
  assert.ok(bonuses >= 4);
  const beforePause = bonuses;
  const clock = game.state.coinSpawn;
  game.toggle();
  game.update(10);
  assert.equal(game.state.coinSpawn, clock);
  assert.equal(bonuses, beforePause);
});

test("magnetic coins earned after a revive are credited correctly without persisting the power-up", () => {
  const { game, e, saved } = boot({ neonRushBank: "1000" });
  game.start();
  game.drawLaunch(1);
  game.collect("magnet");
  game.collect("coin");
  game.end();
  assert.equal(game.state.bank, 1001);
  e("revive").onclick();
  game.update(3);
  assert.equal(game.state.magnet, 0);
  game.collect("magnet");
  game.collect("multiplier");
  game.collect("multiplier");
  const { ball } = game.state;
  game.add = game.addCoinBonus = () => {};
  game.state.objects = [
    { kind: "coin", x: ball.x + 75, y: ball.y - 70, r: 10, angle: 0, spin: 2 },
  ];
  for (let step = 0; step < 120 && game.state.objects.length; step++)
    game.update(1 / 60);
  assert.equal(game.state.runCoins, 5);
  game.end();
  assert.equal(game.state.bank, 905);
  assert.equal(game.state.career.gamesPlayed, 1);
  assert.equal(game.state.career.totalCoinsEarned, 5);
  assert.equal(boot(saved).game.state.magnet, 0);
});

test("expanded magnet reaches visible coins well beyond the old radius", () => {
  const { game } = boot();
  game.start();
  game.drawLaunch(1);
  game.collect("magnet");
  game.add = game.addCoinBonus = () => {};
  const coin = {
    kind: "coin",
    x: game.state.ball.x + 100,
    y: game.state.ball.y - 270,
    r: 10,
    angle: 0,
    spin: 2,
  };
  game.state.objects = [coin];
  game.update(1 / 60);
  assert.equal(coin.magnetized, true);
  for (let frame = 1; frame < 180 && game.state.runCoins === 0; frame++)
    game.update(1 / 60);
  assert.equal(game.state.runCoins, 1);
});

test("frequent trails keep coins visible without granting stationary automatic pickups", () => {
  const { game, sandbox } = boot();
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => 0.1;
  game.start();
  game.drawLaunch(1);
  game.state.invincible = 1000; // Test reward cadence independently of obstacle avoidance.
  let visible = 0,
    sampled = 0,
    maximumObjects = 0;
  for (let frame = 0; frame < 720; frame++) {
    game.update(1 / 60);
    maximumObjects = Math.max(maximumObjects, game.state.objects.length);
    if (frame >= 120) {
      sampled++;
      if (
        game.state.objects.some(
          (object) =>
            object.kind === "coin" && object.y >= 0 && object.y <= game.state.h,
        )
      )
        visible++;
    }
  }
  assert.equal(game.state.mode, "play");
  assert.equal(game.state.runCoins, 0);
  assert.ok(
    visible / sampled > 0.9,
    `Coins visible: ${visible}/${sampled}; peak ${maximumObjects}`,
  );
  assert.ok(
    maximumObjects < 100,
    "Offscreen cleanup bounds the denser coin population",
  );
});

test("bonus stream varies between curved trails and compact clusters", () => {
  const { game, sandbox } = boot();
  sandbox.Math = Object.create(Math);
  function spawn(pattern) {
    const random = [0.5, 0.2, pattern, 0.9];
    sandbox.Math.random = () => random.shift() ?? 0.9;
    game.state.objects = [];
    game.addCoinBonus();
    return game.state.objects;
  }
  const trail = spawn(0.4);
  assert.equal(trail.length, 5);
  assert.equal(new Set(trail.map((coin) => coin.y)).size, 5);
  assert.ok(new Set(trail.map((coin) => coin.x)).size > 3);
  const cluster = spawn(0.9);
  assert.equal(cluster.length, 5);
  assert.equal(cluster[0].y, cluster[1].y);
  assert.notEqual(cluster[0].x, cluster[1].x);
});

test("electric field caches a moving glow and bounds lightning and particle work", () => {
  const { game, document, sandbox } = boot();
  game.start();
  game.drawLaunch(1);
  game.collect("magnet");
  const create = document.createElement;
  let buffers = 0,
    lines = 0,
    particles = 0;
  const sprites = [];
  document.createElement = (tag) => {
    if (tag === "canvas") buffers++;
    return create(tag);
  };
  game.g.drawImage = (image) => sprites.push(image);
  game.g.lineTo = () => lines++;
  game.g.arc = () => particles++;
  game.drawMagnetField();
  assert.equal(buffers, 1);
  const first = sprites[0];
  game.state.ball.x += 50;
  game.state.time += 0.2;
  lines = particles = 0;
  game.drawMagnetField();
  assert.equal(buffers, 1);
  assert.equal(sprites[1], first);
  assert.ok(lines > 30 && lines < 100);
  assert.ok(particles < 30);
  sandbox.innerWidth = 500;
  game.resize();
  game.drawMagnetField();
  assert.equal(buffers, 2);
  assert.notEqual(sprites.at(-1), first);
});

test("high-speed barriers cannot tunnel through the orb on a delayed frame", () => {
  const { game } = boot();
  game.start();
  game.drawLaunch(1);
  game.add = game.addCoinBonus = () => {};
  game.obstacleSpeedAt = () => 1250;
  game.state.objects = [
    {
      kind: "barrier",
      x: game.state.ball.x + 25,
      y: game.state.ball.y - 30,
      r: 16,
      angle: 0,
      spin: 0,
    },
  ];
  game.update(0.04);
  assert.equal(game.state.mode, "over");
});

test("uncapped speeds still detect objects that cross the player and exit within one frame", () => {
  for (const kind of ["barrier", "coin", "multiplier", "magnet"]) {
    const { game } = boot();
    game.start();
    game.drawLaunch(1);
    game.add = game.addCoinBonus = () => {};
    game.state.time = 600;
    game.obstacleSpeedAt = () => 20000; // Exercise swept collisions independently of normal balance.
    game.state.objects = [
      {
        kind,
        x: game.state.ball.x,
        y: game.state.ball.y - 100,
        r: 16,
        angle: 0,
        spin: 0,
      },
    ];
    game.update(0.04);
    assert.equal(game.state.objects.length, 0);
    if (kind === "barrier") assert.equal(game.state.mode, "over");
    if (kind === "coin") assert.equal(game.state.runCoins, 1);
    if (kind === "multiplier") assert.equal(game.state.coinMultiplier, 2);
    if (kind === "magnet") assert.equal(game.state.magnet, 10);
  }
});

test("shop tabs isolate categories and preserve purchases, equipment, balance and reloads", () => {
  const saved = { neonRushBank: "1000" };
  const { game, e } = boot(saved);
  e("openShop").onclick();
  assert.equal(e("skinsPanel").style.display, "block");
  assert.equal(e("backgroundsPanel").style.display, "none");
  assert.equal(e("shopSkinTab").getAttribute("aria-selected"), "true");
  e("shopGrid").children[1].onclick();
  assert.equal(game.state.skin, "cyan");
  e("shopBackgroundTab").onclick();
  assert.equal(e("skinsPanel").style.display, "none");
  assert.equal(e("backgroundsPanel").style.display, "block");
  e("backgroundGrid").children[1].onclick();
  assert.equal(game.state.shopTab, "backgrounds");
  assert.equal(game.state.background, "stars");
  assert.equal(e("shopBackgroundTab").getAttribute("aria-selected"), "true");
  assert.equal(game.state.bank, 50);
  assert.equal(game.state.career.totalCoinsSpent, 950);
  e("menuBack").onclick();
  e("openShop").onclick();
  assert.equal(game.state.shopTab, "backgrounds");
  const reloaded = boot(saved).game;
  assert.equal(reloaded.state.skin, "cyan");
  assert.equal(reloaded.state.background, "stars");
  assert.equal(reloaded.state.bank, 50);
  assert.ok(reloaded.state.owned.includes("cyan"));
  assert.ok(reloaded.state.ownedBackgrounds.includes("stars"));
});

test("shop tabs support keyboard selection and invalid tab names do nothing", () => {
  const { game, e, events } = boot();
  e("openShop").onclick();
  let focused = 0;
  e("shopBackgroundTab").focus = () => focused++;
  events.keydown({
    key: "ArrowRight",
    target: { id: "shopSkinTab" },
    preventDefault() {},
  });
  assert.equal(game.state.shopTab, "backgrounds");
  assert.equal(focused, 1);
  assert.equal(e("shopBackgroundTab").tabIndex, 0);
  assert.equal(e("shopSkinTab").tabIndex, -1);
  events.keydown({
    key: "Home",
    target: { id: "shopBackgroundTab" },
    preventDefault() {},
  });
  assert.equal(game.state.shopTab, "skins");
  game.selectShopTab("invalid");
  assert.equal(game.state.shopTab, "skins");
});

test("magnets are more frequent random bonuses without a guaranteed spawn at any run age", () => {
  const { game, sandbox } = boot();
  sandbox.Math = Object.create(Math);
  let magnets = 0;
  for (let roll = 0; roll < 10000; roll++) {
    sandbox.Math.random = () => (roll + 0.5) / 10000;
    game.state.objects = [];
    game.addCoinBonus();
    magnets += game.state.objects.filter(
      (object) => object.kind === "magnet",
    ).length;
  }
  assert.equal(magnets, 350);
  for (const time of [0, 120, 1200]) {
    game.state.time = time;
    game.state.objects = [];
    sandbox.Math.random = () => 0.8;
    game.addCoinBonus();
    assert.ok(game.state.objects.every((object) => object.kind === "coin"));
    game.state.objects = [];
    sandbox.Math.random = () => 0.001;
    game.addCoinBonus();
    assert.equal(
      game.state.objects.filter((object) => object.kind === "magnet").length,
      1,
    );
  }
});

test("all scenery has distinct bounded animation independent of difficulty and pauses safely", () => {
  const { game, document } = boot();
  let calls = [];
  for (const method of [
    "fillRect",
    "arc",
    "moveTo",
    "lineTo",
    "bezierCurveTo",
    "quadraticCurveTo",
    "ellipse",
    "fillText",
    "drawImage",
  ]) {
    game.g[method] = (...args) =>
      calls.push([
        method,
        ...args.map((value) => (typeof value === "object" ? "sprite" : value)),
      ]);
  }
  const ids = [
    "void",
    "stars",
    "grid",
    "embers",
    "ocean",
    "aurora",
    "nebula",
    "matrix",
    "galaxy",
    "eclipse",
    "warp",
    "cosmic",
  ];
  const fingerprints = new Set();
  for (const id of ids) {
    game.state.background = id;
    game.state.mode = "play";
    game.state.backgroundTime = 10;
    game.drawBackground(0);
    calls = [];
    game.drawBackground(0);
    const first = JSON.stringify(calls);
    assert.ok(
      !fingerprints.has(first),
      id + " needs its own starfield and atmosphere",
    );
    fingerprints.add(first);
    calls = [];
    game.drawBackground(0.03);
    assert.notEqual(JSON.stringify(calls), first, id + " needs animation");
    assert.ok(calls.length < 1500, "Bounded draw workload for " + id);
    const time = game.state.backgroundTime;
    game.state.mode = "paused";
    calls = [];
    game.drawBackground(0.03);
    const paused = JSON.stringify(calls);
    calls = [];
    game.drawBackground(1);
    assert.equal(JSON.stringify(calls), paused);
    assert.equal(game.state.backgroundTime, time);
    game.state.mode = "play";
    document.hidden = true;
    game.drawBackground(1);
    assert.equal(game.state.backgroundTime, time);
    document.hidden = false;
    game.state.speed = 1e9;
    game.state.distance = 1e12;
    calls = [];
    game.drawBackground(0);
    assert.equal(
      JSON.stringify(calls),
      paused,
      "Scenery stays independent of unbounded gameplay speed",
    );
  }
  assert.equal(fingerprints.size, 12);
});

test("scenery does not consume gameplay randomness or mutate saved progress", () => {
  const { game, sandbox, saved } = boot({
    neonRushBank: "123",
    neonRushOwnedBackgrounds: '["void","aurora","cosmic"]',
  });
  const before = JSON.stringify(saved);
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => {
    throw Error("Rendering consumed gameplay randomness");
  };
  for (const background of ["aurora", "nebula", "galaxy", "cosmic", "warp"]) {
    game.state.background = background;
    game.drawBackground(0.016);
  }
  assert.equal(JSON.stringify(saved), before);
  assert.equal(game.state.bank, 123);
});

test("rewards are repositioned away from rotating hazards and remain safe to collect", () => {
  const { game } = boot();
  game.start();
  game.drawLaunch(1);
  game.state.ball.x = game.state.ball.target = 40;
  const hazard = {
    kind: "barrier",
    x: 160,
    y: 200,
    r: 24,
    angle: Math.PI / 4,
    spin: 2,
  };
  game.state.objects = [hazard];
  assert.equal(
    game.spawnGroup([
      { kind: "coin", x: 160, y: 200, r: 10, angle: 0, spin: 2 },
    ]),
    true,
  );
  const coin = game.state.objects.find((object) => object.kind === "coin");
  assert.ok(
    Math.hypot(coin.x - hazard.x, coin.y - hazard.y) >
      24 * Math.SQRT2 + 10 + game.state.ball.r,
  );
  game.state.ball.x = game.state.ball.target = coin.x;
  game.state.ball.y = coin.y;
  game.update(0);
  assert.equal(game.state.runCoins, 1);
  assert.equal(game.state.mode, "play");
});

test("crowded spawn rows skip a reward safely with a bounded number of checks", () => {
  const { game } = boot();
  game.state.objects = [80, 240].map((x) => ({
    kind: "barrier",
    x,
    y: 200,
    r: 24,
    angle: 0,
    spin: 1,
  }));
  const clearance = game.spawnClearance;
  let checks = 0;
  game.spawnClearance = (first, second) => {
    checks++;
    return clearance(first, second);
  };
  assert.equal(
    game.spawnGroup([
      { kind: "magnet", x: 160, y: 200, r: 15, angle: 0, spin: 0 },
    ]),
    false,
  );
  assert.equal(game.state.objects.length, 2);
  assert.ok(checks <= 24);
});

test("primary and bonus spawns never overlap across sustained mobile-width stress runs", () => {
  let acceptedCoins = 0,
    acceptedBarriers = 0;
  for (const width of [280, 320, 390, 844]) {
    const { game, sandbox } = boot();
    sandbox.innerWidth = width;
    game.resize();
    sandbox.Math = Object.create(Math);
    let seed = width;
    sandbox.Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let frame = 0; frame < 400; frame++) {
      game.state.time = frame * 0.08;
      for (const object of game.state.objects)
        object.y += game.obstacleSpeedAt(game.state.time) * 0.08;
      game.state.objects = game.state.objects.filter(
        (object) => object.y < game.state.h + 60,
      );
      const before = new Set(game.state.objects);
      if (frame % 2 === 0) game.add();
      if (frame % 3 === 0) game.addCoinBonus();
      for (const object of game.state.objects) {
        if (!before.has(object)) {
          if (object.kind === "coin") acceptedCoins++;
          if (object.kind === "barrier") acceptedBarriers++;
        }
        const radius =
          object.kind === "barrier" ? object.r * Math.SQRT2 : object.r;
        assert.ok(
          object.x - radius >= 8 - 1e-7 &&
            object.x + radius <= width - 8 + 1e-7,
        );
      }
      for (let first = 0; first < game.state.objects.length; first++)
        for (let second = 0; second < first; second++) {
          const a = game.state.objects[first],
            b = game.state.objects[second];
          const radiusA = a.kind === "barrier" ? a.r * Math.SQRT2 : a.r;
          const radiusB = b.kind === "barrier" ? b.r * Math.SQRT2 : b.r;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          assert.ok(
            distance >= radiusA + radiusB + 6 - 1e-7,
            "Spawn bodies stay disjoint",
          );
          if (a.kind === "barrier" || b.kind === "barrier")
            assert.ok(
              distance > radiusA + radiusB + game.state.ball.r * 2,
              "Orb-sized reward clearance",
            );
        }
    }
  }
  assert.ok(acceptedCoins > 100);
  assert.ok(acceptedBarriers > 30);
});

test("shop has only the main card scrollbar and keeps its back button pinned", () => {
  const css = fs.readFileSync("styles/game.css", "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const grids = rules.filter(([, selector]) => selector.includes(".shopgrid"));
  assert.ok(grids.length > 0);
  for (const [, selector, body] of grids) {
    assert.doesNotMatch(
      body,
      /\boverflow(?:-[xy])?\s*:\s*(auto|scroll|hidden)/,
      selector,
    );
    if (body.includes("max-height"))
      assert.match(body, /max-height\s*:\s*none/);
    assert.doesNotMatch(body, /overscroll-behavior\s*:\s*contain/);
  }
  assert.ok(
    rules.some(
      ([, selector, body]) =>
        selector.trim() === ".card" && /overflow-y:\s*auto/.test(body),
    ),
  );
  assert.ok(
    rules.some(
      ([, selector, body]) =>
        selector.includes(".menu-nav") &&
        /position:\s*sticky/.test(body) &&
        /top:\s*0/.test(body),
    ),
  );
});

test("coin factory produces larger yellow coins and occasional two-value gold coins", () => {
  const { game, sandbox } = boot();
  sandbox.Math = Object.create(Math);
  let gold = 0;
  for (let sample = 0; sample < 10000; sample++) {
    sandbox.Math.random = () => (sample + 0.5) / 10000;
    const coin = game.createCoin(160, -38);
    assert.equal(coin.kind, "coin");
    assert.equal(coin.r, 12);
    if (coin.value === 2) gold++;
    else assert.equal(coin.value, 1);
  }
  assert.equal(gold, 2000);
  sandbox.Math.random = () => 0.94;
  game.add();
  assert.equal(game.state.objects[0].kind, "multiplier");
  assert.equal(game.state.objects[0].r, 20);
  game.state.objects = [];
  sandbox.Math.random = () => 0.001;
  game.addCoinBonus();
  assert.ok(
    game.state.objects
      .filter((object) => object.kind === "coin")
      .every((coin) => coin.r === 12 && coin.value === 2),
  );
  assert.equal(
    game.state.objects.find((object) => object.kind === "magnet").r,
    21,
  );
});

test("larger coin and power-up hitboxes collect at previously unreachable edges", () => {
  for (const [kind, r, dx, value] of [
    ["coin", 12, 21, 1],
    ["coin", 12, 21, 2],
    ["magnet", 21, 29, 0],
    ["multiplier", 20, 28, 0],
  ]) {
    const { game } = boot();
    game.start();
    game.drawLaunch(1);
    game.state.objects = [
      {
        kind,
        r,
        value,
        x: game.state.ball.x + dx,
        y: game.state.ball.y,
        angle: 0,
        spin: 0,
      },
    ];
    game.update(0);
    assert.equal(game.state.objects.length, 0);
    if (kind === "coin") assert.equal(game.state.runCoins, value);
    if (kind === "magnet") assert.equal(game.state.magnet, 10);
    if (kind === "multiplier") assert.equal(game.state.coinMultiplier, 2);
  }
});

test("magnets and every multiplier apply the correct value to both coin types", () => {
  for (const multiplier of [1, 2, 4, 8, 16, 32])
    for (const value of [1, 2]) {
      const { game } = boot();
      game.start();
      game.drawLaunch(1);
      game.collect("magnet");
      game.add = game.addCoinBonus = () => {};
      game.state.coinMultiplier = multiplier;
      game.state.coinBoost = 10;
      game.state.objects = [
        {
          kind: "coin",
          value,
          r: 12,
          x: game.state.ball.x + 110,
          y: game.state.ball.y - 60,
          angle: 0,
          spin: 2,
        },
      ];
      for (let frame = 0; frame < 120 && game.state.objects.length; frame++)
        game.update(1 / 60);
      assert.equal(game.state.runCoins, value * multiplier);
      assert.equal(game.state.objects.length, 0);
      game.update(0.016);
      assert.equal(game.state.runCoins, value * multiplier);
      game.end();
      assert.equal(game.state.bank, value * multiplier);
      assert.equal(game.state.career.totalCoinsEarned, value * multiplier);
    }
});

test("gold coin earnings settle correctly across revives and save reloads", () => {
  const { game, e, saved } = boot({ neonRushBank: "1000" });
  game.start();
  game.drawLaunch(1);
  function gold() {
    return {
      kind: "coin",
      value: 2,
      r: 12,
      x: game.state.ball.x,
      y: game.state.ball.y,
      angle: 0,
      spin: 2,
    };
  }
  game.state.objects = [gold()];
  game.update(0);
  game.end();
  assert.equal(game.state.bank, 1002);
  e("revive").onclick();
  game.update(3);
  game.collect("magnet");
  for (let boost = 0; boost < 3; boost++) game.collect("multiplier");
  game.state.objects = [gold()];
  game.update(0);
  game.end();
  assert.equal(game.state.runCoins, 18);
  assert.equal(game.state.bank, 918);
  assert.equal(game.state.career.totalCoinsEarned, 18);
  assert.equal(game.state.career.gamesPlayed, 1);
  assert.equal(boot(saved).game.state.bank, 918);
});

test("gold and yellow coins have distinct fills and readable value markings", () => {
  const { game } = boot();
  let fills = [],
    labels = [],
    scales = [];
  game.drawBackground = () => {};
  game.state.mode = "menu";
  game.g.fill = () => fills.push(game.g.fillStyle);
  game.g.fillText = (text) => labels.push(text);
  game.g.scale = (x, y) => scales.push([x, y]);
  game.state.objects = [
    { kind: "coin", value: 1, r: 12, x: 40, y: 100, angle: 0.4, spin: 2 },
    { kind: "coin", value: 2, r: 12, x: 90, y: 100, angle: 0.4, spin: 2 },
    { kind: "multiplier", r: 20, x: 140, y: 100, angle: 0, spin: 2 },
    { kind: "magnet", r: 21, x: 200, y: 100, angle: 0, spin: 0.35 },
  ];
  game.draw(0);
  assert.ok(fills.includes("#ffdb59"));
  assert.ok(fills.includes("#b77816"));
  assert.ok(labels.includes("2"));
  assert.ok(labels.includes("2×"));
  assert.ok(scales.some(([x]) => x > 1));
});

test("every theme has bounded falling stars with downward motion and distinct trails", () => {
  const { game } = boot();
  const signatures = new Set();
  for (const id of [
    "void",
    "stars",
    "grid",
    "embers",
    "ocean",
    "aurora",
    "nebula",
    "matrix",
    "galaxy",
    "eclipse",
    "warp",
    "cosmic",
  ]) {
    function capture(time) {
      const moves = [],
        heads = [];
      game.g.moveTo = (x, y) => moves.push({ x, y });
      game.g.fillRect = (x, y) =>
        heads.push({ x: x + 0.7, y: y + 0.7, color: game.g.fillStyle });
      game.drawFallingStars(id, time, 320, 568);
      return { moves, heads };
    }
    game.drawFallingStars(id, 0, 320, 568); // Warm cached glow sprites before measuring frame work.
    const first = capture(0),
      next = capture(0.1);
    assert.ok(first.heads.length >= 6 && first.heads.length <= 28);
    assert.equal(first.heads.length, next.heads.length);
    const length = first.heads[0].y - first.moves[0].y;
    signatures.add(
      first.heads[0].color + ":" + first.heads.length + ":" + length,
    );
    for (let index = 0; index < first.heads.length; index++) {
      const trail = first.heads[index].y - first.moves[index * 2].y;
      let delta = next.heads[index].y - first.heads[index].y;
      if (delta < 0) delta += 568 + trail;
      assert.ok(delta > 0 && delta < 40, id + " stars must fall down smoothly");
      assert.ok(trail > 0);
      assert.ok(next.heads[index].x >= 0 && next.heads[index].x < 320);
    }
  }
  assert.equal(signatures.size, 12);
});

test("Cosmic Zones grow longer and reward successive milestones once per run", () => {
  const { game, e } = boot({ neonRushBank: "2000" });
  game.start();
  game.state.mode = "play";
  game.state.coinMultiplier = 8;
  const names = [
    "The Ascent",
    "Ion Storm",
    "Solar Flare",
    "Quantum Rift",
    "Celestial Realm",
    "Prismatic Nebula",
  ];
  const totals = [0, 25, 75, 175, 350, 625];
  names.forEach((name, index) => {
    game.state.distance = game.zoneStartAt(index + 1) - 1;
    game.syncZoneMilestones();
    assert.equal(game.zoneAt().definition.name, name);
    assert.equal(game.state.runCoins, totals[index]);
    game.syncZoneMilestones();
    assert.equal(game.state.runCoins, totals[index]);
    assert.equal(e("zoneProgress").getAttribute("aria-valuenow"), "99");
  });
  assert.equal(game.zoneAt().index, 5);
  assert.ok(game.zoneDifficulty() > 1.08);
  game.end();
  assert.equal(game.state.bank, 2625);
  e("revive").onclick();
  game.update(3);
  game.update(0);
  assert.equal(game.state.runCoins, 625);
  game.end();
  assert.equal(game.state.bank, 2525);
  game.start();
  assert.equal(game.state.cosmic.milestone, 0);
  assert.equal(game.state.runCoins, 0);
});

test("skipped milestones pay all scaling bonuses and atmospheric transitions preserve equipment", () => {
  const { game, e, saved } = boot({
    neonRushBackground: "aurora",
    neonRushOwnedBackgrounds: '["void","aurora"]',
  });
  game.start();
  game.state.mode = "play";
  const original = JSON.stringify(saved),
    color = [...game.state.cosmic.color];
  game.state.distance = 7000;
  game.syncZoneMilestones();
  assert.equal(game.state.runCoins, 350);
  assert.equal(e("zoneTitle").textContent, "Celestial Realm");
  assert.equal(e("zoneReward").textContent, "● +350");
  assert.deepEqual([...game.state.cosmic.color], color);
  game.updateCosmicEvents(0.8);
  assert.notDeepEqual([...game.state.cosmic.color], color);
  game.updateCosmicEvents(0.8);
  assert.deepEqual(
    [...game.state.cosmic.color],
    [...game.zoneAt().definition.color],
  );
  game.draw(0);
  assert.equal(game.state.background, "aurora");
  assert.equal(JSON.stringify(saved), original);
  game.updateCosmicEvents(2);
  assert.equal(e("zoneAnnouncement").style.display, "none");
});

test("Speed Rush triggers at 1500m, grants five active seconds and bonus distance without repeating", () => {
  const { game, e } = boot();
  game.start();
  game.state.mode = "play";
  game.add = game.addCoinBonus = () => {};
  game.state.distance = 1499;
  game.update(0.04);
  assert.equal(game.state.cosmic.rushMilestone, 0);
  game.update(0.04);
  assert.equal(game.state.cosmic.rushMilestone, 1);
  assert.ok(game.state.cosmic.rushRemaining > 4.9);
  const before = game.state.distance,
    time = game.state.time;
  game.update(0.04);
  assert.ok(
    Math.abs(
      game.state.distance -
        before -
        (game.distanceAt(time + 0.04) - game.distanceAt(time)) * 1.3,
    ) < 1e-7,
  );
  const remaining = game.state.cosmic.rushRemaining;
  game.toggle();
  game.update(2);
  assert.equal(game.state.cosmic.rushRemaining, remaining);
  assert.equal(e("cosmicEvents").style.display, "none");
  game.toggle();
  for (let frame = 0; frame < 126; frame++) game.update(0.04);
  assert.equal(game.state.cosmic.rushRemaining, 0);
  game.update(0);
  assert.equal(game.state.cosmic.rushRemaining, 0);
  game.state.distance = 3000;
  game.update(0);
  assert.equal(game.state.cosmic.rushRemaining, 5);
  game.end();
  assert.equal(game.state.cosmic.rushRemaining, 0);
});

test("Coin Showers last five seconds, use safe collectible patterns and Celestial formations are gold", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  game.state.cosmic.showerCooldown = 0.01;
  game.updateCosmicEvents(0.02);
  assert.equal(game.state.cosmic.showerRemaining, 5);
  let waves = 0;
  const spawn = game.spawnCoinShower;
  game.spawnCoinShower = () => {
    waves++;
    return spawn();
  };
  for (let frame = 0; frame < 125; frame++) game.updateCosmicEvents(0.04);
  assert.ok(game.state.cosmic.showerRemaining < 1e-10);
  assert.ok(waves >= 19 && waves <= 21);
  assert.ok(game.state.objects.length > 0);
  for (let i = 0; i < game.state.objects.length; i++)
    for (let j = 0; j < i; j++) {
      const a = game.state.objects[i],
        b = game.state.objects[j];
      assert.ok(
        Math.hypot(a.x - b.x, a.y - b.y) >= game.spawnClearance(a, b) - 1e-7,
      );
    }
  assert.equal(game.celestialCoins(160), null);
  game.state.distance = 7000;
  const formation = game.celestialCoins(160);
  assert.equal(formation.length, 5);
  assert.ok(formation.every((coin) => coin.value === 2));
});

test("moving and pulsing barriers unlock progressively and reserve their entire sweep with safe paths", () => {
  const { game, sandbox } = boot();
  game.start();
  game.state.mode = "play";
  vm.runInContext("Math.random = () => 0", sandbox);
  const barrier = () => ({
    kind: "barrier",
    x: 160,
    y: -45,
    r: 20,
    angle: 0,
    spin: 1,
  });
  for (const [distance, variant] of [
    [1999, undefined],
    [2000, "moving"],
    [2999, "moving"],
    [3000, "pulsing"],
  ]) {
    game.state.distance = distance;
    game.state.objects = [];
    const object = game.decorateBarrier(barrier());
    assert.equal(object.variant, variant);
    assert.ok(game.spawnGroup([object]));
    const placed = game.state.objects[0],
      radius = game.spawnRadius(placed);
    for (let frame = 0; frame < 100; frame++) {
      game.state.time += 0.04;
      game.moveBarrier(placed);
      assert.ok(
        Math.abs(placed.x - (placed.anchorX ?? placed.x)) +
          placed.r * Math.SQRT2 <=
          radius + 1e-8,
      );
      assert.ok(placed.x - placed.r * Math.SQRT2 >= 8);
      assert.ok(placed.x + placed.r * Math.SQRT2 <= game.state.w - 8);
    }
    assert.ok(game.hasSafePath([]));
    assert.equal(
      game.spawnGroup([
        { kind: "coin", x: placed.anchorX ?? placed.x, y: -45, r: 12 },
      ]),
      true,
    );
    const coin = game.state.objects.at(-1);
    assert.ok(
      Math.hypot(coin.x - game.spawnCenterX(placed), coin.y - placed.y) >=
        game.spawnClearance(coin, placed),
    );
  }
  game.state.objects = [];
  assert.equal(
    game.hasSafePath([
      { ...barrier(), x: 80, r: 48 },
      { ...barrier(), x: 240, r: 48 },
    ]),
    false,
  );
});

test("later-zone mobile stress keeps full moving and pulsing envelopes clear of rewards", () => {
  let variants = 0;
  for (const width of [280, 320, 390]) {
    const { game, sandbox } = boot();
    sandbox.innerWidth = width;
    game.resize();
    sandbox.Math = Object.create(Math);
    let seed = width;
    sandbox.Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let frame = 0; frame < 400; frame++) {
      game.state.distance = 2000 + frame * 20;
      game.state.time += 0.08;
      for (const object of game.state.objects) {
        object.y += 55;
        if (object.kind === "barrier") game.moveBarrier(object);
      }
      game.state.objects = game.state.objects.filter(
        (object) => object.y < game.state.h + 60,
      );
      const before = new Set(game.state.objects);
      if (frame % 2 === 0) game.add();
      if (frame % 3 === 0) game.addCoinBonus();
      if (frame % 5 === 0) game.spawnCoinShower();
      for (const object of game.state.objects) {
        if (!before.has(object) && object.variant) variants++;
        assert.ok(
          game.spawnCenterX(object) - game.spawnRadius(object) >= 8 - 1e-7,
        );
        assert.ok(
          game.spawnCenterX(object) + game.spawnRadius(object) <=
            width - 8 + 1e-7,
        );
      }
      for (let i = 0; i < game.state.objects.length; i++)
        for (let j = 0; j < i; j++) {
          const a = game.state.objects[i],
            b = game.state.objects[j];
          assert.ok(
            Math.hypot(
              game.spawnCenterX(a) - game.spawnCenterX(b),
              a.y - b.y,
            ) >=
              game.spawnClearance(a, b) - 1e-7,
          );
        }
    }
  }
  assert.ok(variants > 20);
});

test("altitude increases encounter density smoothly with a hard maximum independent of speed", () => {
  const { game } = boot();
  let previous = game.spawnIntervalAt(0);
  assert.equal(previous, 0.58);
  for (let distance = 1; distance <= 20000; distance++) {
    const interval = game.spawnIntervalAt(distance);
    assert.ok(interval <= previous && interval >= 0.22);
    assert.ok(previous - interval < 0.001);
    previous = interval;
  }
  assert.equal(game.spawnIntervalAt(1e12), 0.22);
  game.start();
  game.state.mode = "play";
  game.state.distance = 1e6;
  let encounters = 0;
  game.add = () => encounters++;
  game.addCoinBonus = game.spawnCoinShower = () => {};
  for (let frame = 0; frame < 600; frame++) game.update(1 / 60);
  assert.ok(encounters >= 42 && encounters <= 46);
  assert.ok(
    game.state.speed < 550,
    "Altitude/cycles do not multiply physical speed",
  );
  assert.ok(game.zoneDifficulty() <= 1.35);
});

test("safe paths reject unreachable alternating gaps but accept the same arrangement with enough travel time", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  const row = (x, y) => ({ kind: "barrier", x, y, r: 65, angle: 0, spin: 0 });
  const first = row(220, -45),
    tight = row(100, -345),
    spaced = row(100, -1100);
  assert.equal(game.hasSafePath([first]), true);
  assert.equal(game.hasSafePath([tight]), true);
  assert.equal(
    game.hasSafePath([first, tight]),
    false,
    "Individually open rows can require an impossible crossing",
  );
  assert.equal(game.hasSafePath([first, spaced]), true);
  game.state.objects = [first];
  assert.equal(
    game.hasReachablePath([{ kind: "coin", x: 60, y: -45, r: 12 }]),
    true,
  );
  assert.equal(
    game.hasReachablePath([{ kind: "multiplier", x: 300, y: -225, r: 20 }]),
    false,
  );
  assert.equal(
    game.hasReachablePath([{ kind: "multiplier", x: 300, y: -900, r: 20 }]),
    true,
  );
  first.variant = "moving";
  first.anchorX = first.x;
  first.travel = 40;
  assert.equal(
    game.hasSafePath([tight]),
    false,
    "Movement envelope narrows the reachable corridor",
  );
});

test("reaction margin remains conservative while steering tracks immediately without a limit", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  const hazard = {
    kind: "barrier",
    x: 160,
    y: game.state.ball.y - 80,
    r: 24,
    angle: 0,
    spin: 0,
  };
  assert.equal(
    game.hasSafePath([hazard]),
    false,
    "Too little warning to leave the collision envelope",
  );
  hazard.y = -45;
  assert.equal(game.hasSafePath([hazard]), true);
  game.steer(300);
  assert.equal(game.state.ball.x, game.state.ball.target);
  assert.equal(game.state.ball.x, game.state.w - game.state.ball.r - 8);
});

test("higher altitudes introduce alternating gap patterns without exceeding two hazards per encounter", () => {
  const { game, sandbox } = boot();
  game.start();
  game.state.mode = "play";
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => 0.1;
  game.state.time = 0;
  game.add();
  assert.ok(game.state.objects.every((object) => !object.pattern));
  game.state.distance = 12000;
  let patterns = 0;
  for (let row = 0; row < 20; row++) {
    game.state.objects = [];
    game.add();
    assert.ok(game.state.objects.length <= 2);
    const pair = game.state.objects;
    if (
      pair.length === 2 &&
      pair.every((object) => object.pattern === "alternating")
    ) {
      patterns++;
      const gap =
        game.spawnCenterX(pair[1]) -
        game.spawnRadius(pair[1]) -
        game.spawnCenterX(pair[0]) -
        game.spawnRadius(pair[0]);
      assert.ok(gap >= 96 - 1e-7);
      assert.ok(game.hasSafePath([]));
    }
  }
  assert.ok(patterns > 10);
  assert.equal(game.state.patternSide, patterns);
});

test("progressively longer zones match exact thresholds and scale rewards without a milestone loop", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  const thresholds = [0, 1000, 2500, 4500, 7000, 10000, 13500, 17500];
  const rewards = [0, 25, 50, 100, 175, 275, 400, 550];
  let sum = 0;
  thresholds.forEach((distance, index) => {
    assert.equal(game.zoneStartAt(index), distance);
    assert.equal(game.zoneAt(distance).index, index);
    assert.equal(game.zoneAt(distance).progress, 0);
    assert.equal(game.zoneAt(distance).next, game.zoneStartAt(index + 1));
    assert.equal(game.milestoneRewardAt(index), rewards[index]);
    if (index) assert.equal(game.zoneAt(distance - 0.001).index, index - 1);
    sum += rewards[index];
    assert.equal(game.totalMilestoneRewards(index), sum);
  });
  for (const index of [100, 1000, 50000]) {
    assert.equal(game.zoneAt(game.zoneStartAt(index)).index, index);
    assert.equal(game.zoneAt(game.zoneStartAt(index) - 1).index, index - 1);
  }
  game.state.distance = game.zoneStartAt(50000);
  game.syncZoneMilestones();
  assert.equal(game.state.runCoins, game.totalMilestoneRewards(50000));
  game.syncZoneMilestones();
  assert.equal(game.state.runCoins, game.totalMilestoneRewards(50000));
  assert.equal(game.zoneAt(-1).index, 0);
});

test("generated zones never repeat names or themes and do not reset difficulty", () => {
  const { game, sandbox } = boot();
  const names = new Set(),
    themes = new Set();
  let priorDifficulty = 1,
    priorInterval = game.spawnIntervalAt(0);
  for (let index = 0; index < 2000; index++) {
    const altitude = game.zoneStartAt(index);
    const zone = game.zoneAt(altitude);
    assert.ok(!names.has(zone.definition.name));
    names.add(zone.definition.name);
    const theme = JSON.stringify([
      zone.definition.color,
      zone.definition.accent,
      zone.definition.motion,
    ]);
    assert.ok(!themes.has(theme));
    themes.add(theme);
    game.state.distance = altitude;
    assert.ok(game.zoneDifficulty() >= priorDifficulty);
    assert.ok(game.spawnIntervalAt() <= priorInterval);
    priorDifficulty = game.zoneDifficulty();
    priorInterval = game.spawnIntervalAt();
  }
  const definition = JSON.stringify(game.zoneDefinitionAt(513));
  game.zoneDefinitionAt(100000);
  assert.equal(JSON.stringify(game.zoneDefinitionAt(513)), definition);
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => {
    throw Error("Atmosphere must not consume gameplay randomness");
  };
  game.zoneDefinitionAt(99999);
});

test("zone notice stays compact at the top, fades quickly, pauses and clears without blocking play", () => {
  const { game, e } = boot();
  game.start();
  game.state.mode = "play";
  game.state.distance = 1000;
  game.syncZoneMilestones();
  assert.equal(e("zoneAnnouncement").style.display, "flex");
  assert.equal(e("zoneHUD").style.opacity, 0);
  assert.equal(e("zoneAltitude").textContent, "1,000m");
  assert.equal(e("zoneReward").textContent, "● +25");
  game.updateCosmicEvents(1);
  assert.ok(
    e("zoneAnnouncement").style.opacity > 0 &&
      e("zoneAnnouncement").style.opacity < 1,
  );
  const remaining = game.state.cosmic.announcement;
  game.toggle();
  game.update(2);
  assert.equal(game.state.cosmic.announcement, remaining);
  game.toggle();
  game.updateCosmicEvents(0.26);
  assert.equal(e("zoneAnnouncement").style.display, "none");
  assert.equal(e("zoneHUD").style.opacity, 1);
  const css = fs.readFileSync("styles/game.css", "utf8");
  const notice = css.match(/\.zone-announcement\s*\{([^}]+)\}/)[1];
  assert.match(notice, /safe-area-inset-top/);
  assert.match(notice, /height:\s*30px/);
  assert.match(notice, /pointer-events:\s*none/);
  assert.doesNotMatch(notice, /35%/);
});

test("uncapped acceleration updates path planning conservatively at long run times", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  const hazard = { kind: "barrier", x: 160, y: -45, r: 24, angle: 0, spin: 0 };
  assert.equal(game.hasSafePath([hazard]), true);
  game.state.time = 100000;
  assert.ok(game.obstacleSpeedAt(game.state.time) > 35000);
  assert.equal(
    game.hasSafePath([hazard]),
    false,
    "Too little reaction time at extreme speed",
  );
  hazard.x = 50;
  assert.equal(
    game.hasSafePath([hazard]),
    true,
    "Safe forward corridors remain available",
  );
  game.state.distance = game.zoneStartAt(400);
  game.syncZoneMilestones();
  game.updateCosmicEvents(1.6);
  game.draw(0); // Generated atmosphere and transition paths remain valid at late altitudes.
  assert.equal(game.zoneAt().index, 400);
});

test("mouse dragging directly tracks every event at any run speed without waiting for an update", () => {
  const { game, events } = boot();
  game.start();
  game.state.mode = "play";
  let prevented = 0;
  const mouse = (x, extra = {}) => ({
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: x,
    preventDefault() {
      prevented++;
    },
    ...extra,
  });
  events.pointermove(mouse(60));
  assert.equal(game.state.ball.x, 160, "Hover cannot steer");
  events.pointerdown(mouse(40));
  assert.equal(game.state.ball.x, 40);
  for (const [time, x] of [
    [0, 280],
    [100000, 50],
    [1e9, 270],
    [0, -1000],
    [0, 10000],
  ]) {
    game.state.time = time;
    events.pointermove(mouse(x));
    assert.equal(game.state.ball.x, Math.max(21, Math.min(299, x)));
    assert.equal(game.state.ball.target, game.state.ball.x);
  }
  const position = game.state.ball.x;
  game.state.time = 0;
  game.add = game.addCoinBonus = () => {};
  game.update(0.04);
  assert.equal(
    game.state.ball.x,
    position,
    "No delayed movement after the event",
  );
  events.pointerup(mouse(80, { buttons: 0 }));
  assert.equal(game.state.ball.x, 80);
  events.pointermove(mouse(240));
  assert.equal(game.state.ball.x, 80);
  assert.ok(prevented >= 7);
});

test("touch dragging tracks zero-button events, captures one finger and cleans up cancel/lost capture", () => {
  const { game, events } = boot();
  game.start();
  game.state.mode = "play";
  const captured = new Set();
  let prevented = 0;
  game.c.setPointerCapture = (id) => captured.add(id);
  game.c.hasPointerCapture = (id) => captured.has(id);
  game.c.releasePointerCapture = (id) => captured.delete(id);
  const touch = (id, x, extra = {}) => ({
    pointerId: id,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: x,
    preventDefault() {
      prevented++;
    },
    ...extra,
  });
  events.pointerdown(touch(1, 60));
  assert.ok(captured.has(1));
  assert.equal(game.state.ball.x, 60);
  events.pointermove(touch(1, 275));
  assert.equal(game.state.ball.x, 275);
  events.pointerdown(touch(2, 90, { isPrimary: false }));
  events.pointermove(touch(2, 90));
  assert.equal(game.state.ball.x, 275, "Second finger cannot steal steering");
  events.pointercancel(touch(1, 100));
  assert.equal(captured.size, 0);
  events.pointermove(touch(1, 100));
  assert.equal(game.state.ball.x, 275);
  events.pointerdown(touch(3, 100));
  assert.equal(game.state.ball.x, 100);
  events.lostpointercapture(touch(3, 250));
  events.pointermove(touch(3, 250));
  assert.equal(game.state.ball.x, 100);
  events.pointerdown(touch(4, 150));
  events.blur();
  assert.equal(captured.size, 0);
  const before = game.state.ball.x;
  events.pointermove(touch(4, 250));
  assert.equal(game.state.ball.x, before);
  assert.ok(prevented >= 4);
  const css = fs.readFileSync("styles/game.css", "utf8");
  assert.match(css, /canvas\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /canvas\s*\{[^}]*user-select:\s*none/);
});

test("pointer coordinates respect canvas bounds and coalesced samples preserve the actual drag path", () => {
  const { game, events } = boot();
  game.start();
  game.state.mode = "play";
  game.c.getBoundingClientRect = () => ({ left: 20, width: 640 });
  const event = (x) => ({
    pointerId: 1,
    pointerType: "touch",
    clientX: x,
    buttons: 0,
    preventDefault() {},
  });
  events.pointerdown(event(100));
  assert.equal(game.state.ball.x, 40);
  const positions = [];
  const steer = game.steer;
  game.steer = (x) => {
    positions.push(x);
    steer(x);
  };
  events.pointermove({
    ...event(580),
    getCoalescedEvents: () => [event(220), event(420)],
  });
  assert.deepEqual(positions, [100, 200, 280]);
  assert.equal(game.state.ball.x, 280);
  game.state.mode = "countdown";
  game.state.reviveCountdown = 3;
  events.pointermove(event(300));
  assert.equal(game.state.ball.x, 140);
  game.update(0.01);
  assert.equal(game.state.ball.x, 140);
  game.state.mode = "paused";
  events.pointermove(event(500));
  assert.equal(game.state.ball.x, 140);
});

test("fast horizontal swipes resolve pickups and hazards in travel order without tunneling or duplicate payouts", () => {
  const { game, events } = boot();
  game.start();
  game.state.mode = "play";
  game.state.ball.x = game.state.ball.target = 40;
  const object = (kind, x, value) => ({
    kind,
    x,
    value,
    y: game.state.ball.y,
    r: kind === "multiplier" ? 20 : 12,
    angle: 0,
    spin: 0,
  });
  game.state.objects = [
    object("coin", 230, 1),
    object("barrier", 180),
    object("coin", 130, 2),
    object("multiplier", 90),
  ];
  events.pointerdown({
    pointerId: 1,
    pointerType: "mouse",
    buttons: 1,
    clientX: 280,
  });
  assert.equal(game.state.ball.x, 280);
  assert.equal(game.state.mode, "over");
  assert.equal(
    game.state.runCoins,
    4,
    "Multiplier applies before gold coin; later coin is beyond fatal hazard",
  );
  assert.equal(game.state.bank, 4);
  assert.equal(game.state.objects.length, 1);
  game.update(0);
  assert.equal(game.state.bank, 4);
});

test("reverse swipes retain shields, magnet refresh and multiplier mechanics through the shared collision path", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  game.state.ball.x = game.state.ball.target = 290;
  const object = (kind, x) => ({
    kind,
    x,
    y: game.state.ball.y,
    r: 12,
    angle: 0,
    spin: 0,
  });
  game.state.objects = [
    object("coin", 60),
    object("barrier", 120),
    object("shield", 170),
    object("magnet", 220),
  ];
  game.steer(30);
  assert.equal(game.state.mode, "play");
  assert.equal(game.state.objects.length, 0);
  assert.equal(game.state.runCoins, 1);
  assert.equal(game.state.shield, 0);
  assert.equal(game.state.magnet, 10);
  game.update(0);
  assert.equal(game.state.runCoins, 1);
  const before = game.state.ball.x;
  game.steer(NaN);
  game.steer(Infinity);
  assert.equal(game.state.ball.x, before);
});

test("raw pointer input tracks mouse and touch immediately without duplicate movement handlers", () => {
  for (const pointerType of ["mouse", "touch"]) {
    const { game, events } = boot({}, false, true);
    game.start();
    game.state.mode = "play";
    assert.equal(events.pointermove, undefined);
    assert.equal(typeof events.pointerrawupdate, "function");
    const pointer = (x) => ({
      pointerId: 1,
      pointerType,
      clientX: x,
      button: 0,
      buttons: pointerType === "mouse" ? 1 : 0,
      preventDefault() {},
    });
    events.pointerdown(pointer(40));
    for (const x of [290, 60, 260, 100]) {
      events.pointerrawupdate(pointer(x));
      assert.equal(game.state.ball.x, x);
      assert.equal(game.state.ball.target, x);
    }
    events.pointercancel(pointer(100));
    events.pointerrawupdate(pointer(200));
    assert.equal(game.state.ball.x, 100);
  }
});

test("cloud layers cover the viewport, reuse bounded textures and animate without rebaking", () => {
  const { game, document } = boot();
  let created = 0,
    blits = [];
  const create = document.createElement;
  document.createElement = (tag) => {
    created++;
    return create(tag);
  };
  game.g.drawImage = (canvas, x, y, w, h) => blits.push({ canvas, x, y, w, h });
  game.drawEnvironmentArt("nebula", 0, 390, 844);
  assert.equal(created, 2);
  assert.equal(blits.length, 2);
  const original = blits.map((blit) => blit.canvas),
    firstX = blits[0].x;
  for (const blit of blits) {
    assert.ok(blit.x <= 0 && blit.y <= 0);
    assert.ok(blit.x + blit.w >= 390 && blit.y + blit.h >= 844);
    assert.equal(blit.canvas.width, 192);
    assert.equal(blit.canvas.height, 288);
  }
  blits = [];
  for (let frame = 1; frame <= 120; frame++)
    game.drawEnvironmentArt("nebula", frame / 60, 390, 844);
  assert.equal(created, 2, "Cloud pixels are not recomputed in the frame loop");
  assert.equal(blits.length, 240);
  assert.equal(blits[0].canvas, original[0]);
  assert.notEqual(blits.at(-2).x, firstX);
  game.drawEnvironmentArt("cosmic", 0, 844, 390);
  assert.equal(created, 4);
  game.drawEnvironmentArt("nebula", 0, 320, 568);
  assert.equal(created, 4, "Resize uses existing textures");
  game.drawEnvironmentArt("ocean", 0, 390, 844);
  assert.equal(created, 6);
  game.drawEnvironmentArt("nebula", 0, 390, 844);
  assert.equal(created, 8, "Only two theme texture sets are retained");
});

test("obstacle encounters become substantially denser by 500-1000m while early patterns and rewards stay safe", () => {
  const { game, sandbox } = boot();
  game.start();
  game.state.mode = "play";
  assert.ok(game.spawnIntervalAt(500) < 0.52);
  assert.ok(game.spawnIntervalAt(1000) < 0.42);
  assert.equal(game.spawnIntervalAt(1e9), 0.22);
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => 0.1;
  game.state.distance = 1500;
  game.add();
  assert.ok(
    game.state.objects.some((object) => object.pattern === "alternating"),
  );
  assert.ok(game.state.objects.length <= 2);
  const group = game.state.objects;
  game.state.objects = [];
  assert.ok(game.hasSafePath(group));
  game.state.objects = group;
  game.addCoinBonus();
  assert.ok(game.state.objects.some((object) => object.kind === "coin"));
  for (let i = 0; i < game.state.objects.length; i++)
    for (let j = 0; j < i; j++) {
      const a = game.state.objects[i],
        b = game.state.objects[j];
      assert.ok(
        Math.hypot(game.spawnCenterX(a) - game.spawnCenterX(b), a.y - b.y) >=
          game.spawnClearance(a, b) - 1e-7,
      );
    }
});

test("rotating-square corner collisions use visible geometry, without rounded-box false positives", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  const square = { kind: "barrier", r: 20, angle: Math.PI / 4 };
  assert.equal(
    game.contactFraction(square, 35, 0, 35, 0),
    0,
    "Corner extends beyond old circle",
  );
  assert.equal(
    game.contactFraction(square, 39, 0, 39, 0),
    null,
    "Outside visible corner plus orb radius",
  );
  square.angle = 0;
  assert.equal(game.contactFraction(square, 27, 27, 27, 27), 0);
  assert.equal(
    game.contactFraction(square, 28, 28, 28, 28),
    null,
    "Rounded corners avoid invisible expanded-box hits",
  );
  assert.ok(game.contactFraction(square, -80, 0, 80, 0) > 0);
  game.state.objects = [
    {
      ...square,
      x: game.state.ball.x - 35,
      y: game.state.ball.y,
      angle: Math.PI / 4,
      spin: 0,
    },
  ];
  game.update(0);
  assert.equal(game.state.mode, "over");
});

test("same-frame contacts resolve chronologically regardless of object insertion order", () => {
  for (const reversed of [false, true]) {
    const { game } = boot();
    game.start();
    game.state.mode = "play";
    game.obstacleSpeedAt = () => 10000;
    game.add = game.addCoinBonus = () => {};
    const object = (kind, offset, value) => ({
      kind,
      value,
      x: game.state.ball.x,
      y: game.state.ball.y - offset,
      r: 12,
      angle: 0,
      spin: 0,
    });
    const objects = [
      object("multiplier", 40),
      object("coin", 100, 2),
      object("barrier", 160),
      object("coin", 210, 2),
    ];
    game.state.objects = reversed ? objects.reverse() : objects;
    game.update(0.04);
    assert.equal(game.state.mode, "over");
    assert.equal(game.state.runCoins, 4);
    assert.equal(game.state.bank, 4);
  }
});

test("hidden frames do no rendering; paused frames redraw only when the visual state changes", () => {
  const { game, tick, document, events, e } = boot();
  game.start();
  game.drawLaunch(1);
  let draws = 0;
  const draw = game.draw;
  game.draw = (dt) => {
    draws++;
    draw(dt);
  };
  tick(1000);
  game.toggle();
  tick(1017);
  const pausedDraws = draws;
  for (let frame = 0; frame < 120; frame++) tick(1034 + frame * 17);
  assert.equal(draws, pausedDraws);
  e("openShop").onclick();
  game.state.background = "aurora";
  tick(4000);
  assert.equal(
    draws,
    pausedDraws + 1,
    "Equipping while paused still refreshes scenery",
  );
  document.hidden = true;
  events.visibilitychange();
  const before = draws;
  for (let frame = 0; frame < 120; frame++) tick(5000 + frame * 17);
  assert.equal(draws, before);
  assert.equal(game.state.last, 0);
  document.hidden = false;
  events.visibilitychange();
  game.toggle();
  tick(20000);
  assert.equal(game.state.mode, "play");
  assert.equal(game.state.time, 0, "No hidden-time catch-up");
});

test("HUD labels avoid unchanged text, attributes and repeated style writes", () => {
  const { game, metrics } = boot();
  game.start();
  game.state.mode = "play";
  game.update(0);
  const before = { ...metrics };
  for (let index = 0; index < 120; index++) game.update(0);
  assert.equal(metrics.textWrites, before.textWrites);
  assert.equal(metrics.styleWrites, before.styleWrites);
  assert.equal(metrics.attributeWrites, before.attributeWrites);
  assert.equal(metrics.lookups, before.lookups, "HUD elements are cached");
});

test("orientation changes pause safely and rebuild placements for the new screen", () => {
  const { game, sandbox, events } = boot();
  game.start();
  game.state.mode = "play";
  game.state.objects = [
    { kind: "barrier", x: 220, y: 40, r: 24, angle: 0.4, spin: 1 },
    game.createCoin(60, -30),
  ];
  sandbox.innerWidth = 280;
  sandbox.innerHeight = 844;
  events.resize();
  assert.equal(game.state.mode, "paused");
  assert.equal(game.state.ball.y, 844 * 0.77);
  for (const object of game.state.objects) {
    assert.ok(game.spawnCenterX(object) - game.spawnRadius(object) >= 8);
    assert.ok(game.spawnCenterX(object) + game.spawnRadius(object) <= 272);
  }
  const objects = game.state.objects;
  game.state.objects = [];
  assert.ok(game.hasSafePath(objects));
  game.state.objects = objects;
  game.toggle();
  assert.equal(game.state.mode, "play");
});

test("offscreen objects skip drawing without disappearing from the world, and disposal releases caches", () => {
  const { game, events } = boot();
  game.start();
  game.state.mode = "play";
  game.draw(0);
  game.drawBackground = game.drawCosmicZones = () => {};
  game.state.objects = [game.createCoin(100, -1000), game.createCoin(100, 200)];
  let sprites = 0;
  game.g.drawImage = () => {
    sprites++;
  };
  game.draw(0);
  const visibleSprites = sprites;
  game.state.objects[0].y = 100;
  sprites = 0;
  game.draw(0);
  assert.equal(
    sprites - visibleSprites,
    1,
    "One additional cached coin sprite draws when visible",
  );
  assert.equal(game.state.objects.length, 2);
  game.destroy();
  assert.equal(Object.keys(events).length, 0);
  assert.equal(game.state.objects.length, 0);
  assert.equal(game.state.sparks.length, 0);
});

test("extended 120,000m simulation keeps accounting, three revives and transient memory bounded", () => {
  const { game, e, sandbox, saved } = boot({ neonRushBank: "1000000" });
  sandbox.Math = Object.create(Math);
  let seed = 7409;
  sandbox.Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  game.start();
  game.state.mode = "play";
  game.state.invincible = 1e6;
  let peakObjects = 0,
    peakSparks = 0,
    frame = 0,
    totalPaid = 0;
  const thresholds = [10000, 50000, 100000];
  while (game.state.distance < 120000 && frame < 40000) {
    if (frame % 300 === 0) {
      for (let count = 0; count < 12; count++)
        game.resolveContact({
          kind: "multiplier",
          x: game.state.ball.x,
          y: game.state.ball.y,
        });
      assert.equal(game.state.coinMultiplier, 32);
      game.resolveContact({
        kind: "magnet",
        x: game.state.ball.x,
        y: game.state.ball.y,
      });
    }
    game.update(0.04);
    frame++;
    peakObjects = Math.max(peakObjects, game.state.objects.length);
    peakSparks = Math.max(peakSparks, game.state.sparks.length);
    if (thresholds.length && game.state.distance >= thresholds[0]) {
      thresholds.shift();
      game.end();
      const price = game.reviveCost();
      totalPaid += price;
      e("revive").onclick();
      game.update(3);
      assert.equal(game.state.mode, "play");
      game.state.invincible = 1e6;
    }
    assert.equal(game.state.mode, "play");
  }
  assert.ok(game.state.distance >= 120000);
  game.end();
  assert.equal(game.state.career.gamesPlayed, 1);
  assert.equal(
    game.state.career.totalDistance,
    Math.floor(game.state.distance),
  );
  assert.equal(game.state.career.totalCoinsEarned, game.state.runCoins);
  assert.equal(game.state.bank, 1000000 + game.state.runCoins - totalPaid);
  assert.equal(game.state.cosmic.milestone, game.zoneAt().index);
  assert.ok(peakObjects < 180);
  assert.ok(peakSparks < 1000);
  assert.equal(game.state.revives, 3);
  const reloaded = boot(saved).game;
  assert.equal(reloaded.state.bank, game.state.bank);
  assert.equal(
    reloaded.state.career.totalDistance,
    game.state.career.totalDistance,
  );
  game.destroy();
  reloaded.destroy();
});

test("hundreds of zone transitions remain bounded and never duplicate milestone rewards", () => {
  const { game } = boot();
  game.start();
  game.state.mode = "play";
  for (let index = 1; index <= 400; index++) {
    game.state.distance = game.zoneStartAt(index);
    game.syncZoneMilestones();
    game.updateCosmicEvents(0.016);
    assert.equal(game.state.runCoins, game.totalMilestoneRewards(index));
    assert.equal(game.state.cosmic.index, index);
    assert.ok(
      game.state.cosmic.color.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 255,
      ),
    );
    game.syncZoneMilestones();
    assert.equal(game.state.runCoins, game.totalMilestoneRewards(index));
  }
  let paths = 0;
  game.g.beginPath = () => paths++;
  game.drawCosmicZones();
  assert.ok(paths < 60, "Atmosphere work does not grow with historical zones");
});

test("development server handler survives malformed URL encoding and keeps paths inside the project", async () => {
  const { createServer } = require("../tools/serve.cjs");
  const server = createServer();
  const request = (url) =>
    new Promise((resolve) => {
      let status;
      server.emit(
        "request",
        { url },
        {
          writeHead(value) {
            status = value;
            return this;
          },
          end(body) {
            resolve({ status, body });
          },
        },
      );
    });
  assert.equal((await request("/%E0%A4%A")).status, 400);
  assert.equal((await request("/%2e%2e%5coutside.txt")).status, 403);
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.ok(String(response.body).includes("OrbLift"));
});

test("coin glow sprites are reused, stay upright and release their backing stores on disposal", () => {
  const { game, document } = boot();
  game.start();
  game.state.mode = "play";
  game.drawBackground = game.drawCosmicZones = () => {};
  const buffers = [];
  const create = document.createElement;
  document.createElement = (tag) => {
    const result = create(tag);
    if (tag === "canvas") buffers.push(result);
    return result;
  };
  game.state.objects = [
    { ...game.createCoin(80, 200), value: 1 },
    { ...game.createCoin(120, 200), value: 2 },
  ];
  game.draw(0);
  const allocated = buffers.length;
  let rotations = 0;
  game.g.rotate = () => rotations++;
  for (let frame = 0; frame < 120; frame++) {
    for (const coin of game.state.objects) coin.angle += 0.1;
    game.draw(0);
  }
  assert.equal(buffers.length, allocated);
  assert.equal(rotations, 0);
  game.destroy();
  assert.ok(
    buffers.every((canvas) => canvas.width === 1 && canvas.height === 1),
  );
});

test("shield HUD updates synchronously after a swipe collects or breaks a shield", () => {
  const { game, e } = boot();
  game.start();
  game.state.mode = "play";
  game.resolveContact({ kind: "shield", x: 100, y: 100 });
  assert.equal(e("shield").textContent, "SHIELD 6s");
  game.resolveContact({ kind: "barrier", x: 100, y: 100 });
  assert.equal(e("shield").textContent, "");
  game.resolveContact({ kind: "shield", x: 100, y: 100 });
  game.toggle();
  assert.equal(e("shield").textContent, "");
});
