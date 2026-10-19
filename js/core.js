"use strict";
// Runtime state is explicit and belongs to one game, independent of its host.
OrbLift.createGame = function createGame(environment) {
  const { document, window } = environment;
  const storage = OrbLift.createStorage(window);
  const { safeStorage, readJSON, nonnegative } = storage;
  const { skins, backgrounds } = OrbLift.content;
  const normalizeOwned = (value, items, free) => [
    ...new Set([
      free,
      ...(Array.isArray(value) ? value : []).filter((id) =>
        items.some((item) => item.id === id),
      ),
    ]),
  ];
  const savedCareer = readJSON("neonRushCareer", {});
  const career = Object.fromEntries(
    ["totalDistance", "gamesPlayed", "totalCoinsEarned", "totalCoinsSpent"].map(
      (key) => [key, nonnegative(savedCareer?.[key])],
    ),
  );
  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    mode: "menu",
    pausedFrom: "play",
    last: 0,
    time: 0,
    distance: 0,
    runCoins: 0,
    speed: OrbLift.balance.startingSpeed,
    spawn: 0,
    coinBoost: 0,
    coinMultiplier: 1,
    magnet: 0,
    backgroundTime: 0,
    shopTab: "skins",
    coinSpawn: 0,
    objects: [],
    sparks: [],
    shield: 0,
    invincible: 0,
    revives: 0,
    reviveCountdown: 0,
    creditedCoins: 0,
    bank: nonnegative(safeStorage.getItem("neonRushBank")),
    best: nonnegative(safeStorage.getItem("neonRushDistanceBest")),
    skin: safeStorage.getItem("neonRushSkin") || "pink",
    background: safeStorage.getItem("neonRushBackground") || "void",
    owned: normalizeOwned(readJSON("neonRushOwned", ["pink"]), skins, "pink"),
    ownedBackgrounds: normalizeOwned(
      readJSON("neonRushOwnedBackgrounds", ["void"]),
      backgrounds,
      "void",
    ),
    career,
    recordedDistance: 0,
    recordedCoins: 0,
    runCounted: false,
    ball: {
      x: 0,
      y: 0,
      target: 0,
      r: 13,
    },
    launchElapsed: 0,
    launchParticles: [],
  };
  if (!state.owned.includes(state.skin)) state.skin = "pink";
  if (!state.ownedBackgrounds.includes(state.background))
    state.background = "void";
  const c = document.querySelector("canvas");
  const elements = new Map();
  const game = {
    environment,
    storage,
    state,
    c,
    g: c.getContext("2d"),
    $: (id) => {
      if (!elements.has(id)) elements.set(id, document.getElementById(id));
      return elements.get(id);
    },
    rnd: (a, b) => a + Math.random() * (b - a),
    clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
  };
  OrbLift.installProgress(game);
  OrbLift.installBackgrounds(game);
  OrbLift.installRendering(game);
  OrbLift.installUi(game);
  OrbLift.installGameplay(game);
  OrbLift.installCosmicZones(game);
  game.updateRank();
  game.$("coinRate").textContent = "1×";
  game.$("bank").textContent = state.bank;
  game.$("best").textContent = state.best + " m";
  game.$("summary").textContent = "● " + state.bank + " coins saved";
  game.resize();
  OrbLift.installInput(game);
  let frameId;
  let disposed = false;
  let frozenFrameKey = "";
  function frame(timestamp) {
    if (disposed) return;
    if (document.hidden) {
      state.last = 0;
      frameId = environment.requestAnimationFrame(frame);
      return;
    }
    const dt = state.last
      ? Math.max(0, Math.min((timestamp - state.last) / 1000, 0.04))
      : 0;
    state.last = timestamp;
    game.update(dt);
    const frozen = ["paused", "countdown"].includes(state.mode);
    const key = frozen
      ? [
          state.mode,
          state.w,
          state.h,
          state.dpr,
          state.background,
          state.skin,
          state.ball.x,
          state.ball.y,
          state.magnet,
          state.shield,
          state.invincible,
        ].join("|")
      : "";
    if (!frozen || key !== frozenFrameKey) {
      game.draw(dt);
      game.drawLaunch(dt);
    }
    frozenFrameKey = key;
    frameId = environment.requestAnimationFrame(frame);
  }
  // Native hosts can dispose an instance before replacing its WebView surface.
  game.destroy = () => {
    disposed = true;
    environment.cancelAnimationFrame?.(frameId);
    game.removeInput();
    game.disposeRendering();
    game.disposeBackgrounds();
    state.objects = [];
    state.sparks = [];
    state.launchParticles = [];
    c.width = c.height = 1;
    elements.clear();
  };
  frameId = environment.requestAnimationFrame(frame);
  return game;
};
