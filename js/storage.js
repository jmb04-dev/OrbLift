"use strict";
const OrbLift = {};
// Each game instance owns its cache; the browser still uses the legacy keys.
OrbLift.createStorage = function createStorage(window) {
  const originalStorage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  // Keep the legacy keys; storage failures must never interrupt gameplay.
  const cache = new Map();
  const safeStorage = {
    getItem(key) {
      if (cache.has(key)) return cache.get(key);
      try {
        return originalStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      cache.set(key, String(value));
      try {
        originalStorage.setItem(key, String(value));
      } catch {}
    },
  };
  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(safeStorage.getItem(key));
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }
  function nonnegative(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }
  return {
    safeStorage,
    readJSON,
    nonnegative,
  };
};
