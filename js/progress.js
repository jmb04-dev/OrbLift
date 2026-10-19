"use strict";
// Install progress behavior on a single game instance.
OrbLift.installProgress = function (game) {
  const state = game.state;
  const { safeStorage } = game.storage;
  const { tiers } = OrbLift.content;
  game.saveCareer = function saveCareer() {
    safeStorage.setItem("neonRushCareer", JSON.stringify(state.career));
    game.updateRank();
  };
  game.rank = function rank() {
    return (
      [...tiers].reverse().find((t) => state.career.totalDistance >= t.min) ||
      tiers[0]
    );
  };
  game.recordRun = function recordRun() {
    const meters = Math.floor(state.distance),
      delta = Math.max(0, meters - state.recordedDistance),
      coins = Math.max(0, state.runCoins - state.recordedCoins);
    state.career.totalDistance += delta;
    state.career.totalCoinsEarned += coins;
    state.recordedDistance = meters;
    state.recordedCoins = state.runCoins;
    if (!state.runCounted) {
      state.career.gamesPlayed++;
      state.runCounted = true;
    }
    game.saveCareer();
  };
  game.spendCoins = function spendCoins(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0 || state.bank < amount)
      return false;
    state.bank -= amount;
    state.career.totalCoinsSpent += amount;
    safeStorage.setItem("neonRushBank", state.bank);
    game.updateWallet();
    game.saveCareer();
    return true;
  };
};
