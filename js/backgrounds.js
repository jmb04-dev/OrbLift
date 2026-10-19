"use strict";

// All scenery is cosmetic. Animation uses its own clock rather than uncapped
// obstacle speed or distance, so expensive themes stay calm and readable.
OrbLift.installBackgrounds = function installBackgrounds(game) {
  const { g, state } = game;
  OrbLift.installEnvironmentArt(game);
  OrbLift.installFormations(game);
  const tau = Math.PI * 2;
  const profiles = {
    void: {
      count: 26,
      colors: ["#9cb6df"],
      speed: 16,
      drift: 2,
      size: 1,
      opacity: 0.25,
    },
    stars: {
      count: 88,
      colors: ["#dfefff", "#7dabff", "#ffd5ed"],
      speed: 28,
      drift: 3,
      size: 1.6,
      opacity: 0.7,
    },
    grid: {
      count: 26,
      colors: ["#b578ff", "#48e6ff"],
      speed: 19,
      drift: 0,
      size: 1.1,
      opacity: 0.35,
    },
    embers: {
      count: 42,
      colors: ["#ffbc54", "#ff6f4f", "#ffe1a5"],
      speed: -38,
      drift: 12,
      size: 2,
      opacity: 0.55,
    },
    ocean: {
      count: 34,
      colors: ["#39dfff", "#6af6ca"],
      speed: -16,
      drift: 7,
      size: 1.8,
      opacity: 0.4,
    },
    aurora: {
      count: 64,
      colors: ["#e0fff4", "#b0d3ff"],
      speed: 7,
      drift: 1,
      size: 1.2,
      opacity: 0.55,
    },
    nebula: {
      count: 58,
      colors: ["#f1b9ff", "#8cbbff", "#ff94ce"],
      speed: 13,
      drift: -9,
      size: 1.5,
      opacity: 0.5,
    },
    matrix: {
      count: 24,
      colors: ["#39ffae", "#8debd3"],
      speed: 43,
      drift: 0,
      size: 1.5,
      opacity: 0.3,
    },
    galaxy: {
      count: 38,
      colors: ["#9fafff", "#ffc6ed"],
      speed: 5,
      drift: 3,
      size: 1.1,
      opacity: 0.35,
    },
    eclipse: {
      count: 30,
      colors: ["#f9d4b6", "#d8ddff"],
      speed: 8,
      drift: -2,
      size: 1.1,
      opacity: 0.45,
    },
    warp: {
      count: 0,
      colors: ["#8aeaff"],
      speed: 0,
      drift: 0,
      size: 1,
      opacity: 0.5,
    },
    cosmic: {
      count: 54,
      colors: ["#ffe0a0", "#d6b2ff", "#ffb6da"],
      speed: 10,
      drift: 6,
      size: 1.6,
      opacity: 0.5,
    },
  };
  game.backgroundDescriptions = {
    void: "Indigo dust clouds · distant starlight",
    stars: "Layered constellations · shooting stars",
    grid: "Violet ion clouds · turquoise starlight",
    embers: "Solar ribbons · rising sparks",
    ocean: "Light shafts · bioluminescent currents",
    aurora: "Silk curtains · shimmering northern lights",
    nebula: "Violet cloud banks · drifting filaments",
    matrix: "Emerald gas clouds · jade stellar nursery",
    galaxy: "Rotating spiral arms · luminous core",
    eclipse: "Living corona · orbiting solar dust",
    warp: "Azure cloud currents · fast stellar trails",
    cosmic: "Gold and opal nebulae · luminous cosmic dust",
  };
  // Fixed deterministic seeds: rendering never consumes gameplay randomness.
  const fields = {};
  // count, downward pixels/second, trail length, tint, horizontal drift.
  // Separate from atmospheric sparks/bubbles so every scene has falling stars.
  const fallingProfiles = {
    void: [6, 60, 12, "#91a9d2", 1],
    stars: [22, 90, 22, "#d2eaff", 3],
    grid: [12, 110, 20, "#b48bff", 0],
    embers: [14, 140, 26, "#ffc471", 7],
    ocean: [12, 65, 16, "#65e7dd", -3],
    aurora: [18, 85, 20, "#c3ffeb", 2],
    nebula: [16, 72, 28, "#e6acff", -5],
    matrix: [16, 140, 24, "#79ffc1", 0],
    galaxy: [18, 100, 18, "#b6bfff", 4],
    eclipse: [10, 68, 30, "#ffd3af", -2],
    warp: [28, 170, 40, "#85e4ff", 6],
    cosmic: [20, 95, 28, "#ffe1a2", 3],
  };
  const fallingFields = {};
  Object.keys(profiles).forEach((id, themeIndex) => {
    let seed = 137 + themeIndex * 7919;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    fields[id] = Array.from({ length: profiles[id].count }, () => ({
      x: random(),
      y: random(),
      depth: 0.25 + random() * 0.75,
      phase: random() * tau,
      size: 0.5 + random(),
    }));
    fallingFields[id] = Array.from({ length: fallingProfiles[id][0] }, () => ({
      x: random(),
      y: random(),
      depth: random(),
    }));
  });
  const glows = new Map();
  game.disposeBackgrounds = () => {
    for (const glow of glows.values()) glow.width = glow.height = 1;
    glows.clear();
    game.disposeEnvironmentArt();
    game.disposeFormations();
  };
  const wrap = (value, span) => ((value % span) + span) % span;
  game.drawFallingStars = function drawFallingStars(id, time, w, h) {
    const [, speed, trail, color, wind] = fallingProfiles[id];
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    for (const star of fallingFields[id]) {
      const length = trail * (0.6 + star.depth * 0.6);
      const y =
        wrap(
          star.y * (h + length) + time * speed * (0.6 + star.depth),
          h + length,
        ) - length;
      const x = wrap(star.x * w + time * wind * (0.6 + star.depth), w);
      const opacity = 0.12 + star.depth * 0.3;
      g.lineWidth = 0.7 + star.depth * 0.7;
      g.globalAlpha = opacity * 0.3;
      g.beginPath();
      g.moveTo(x - wind * 0.08, y - length);
      g.lineTo(x - wind * 0.03, y - length * 0.35);
      g.stroke();
      g.globalAlpha = opacity;
      g.beginPath();
      g.moveTo(x - wind * 0.03, y - length * 0.35);
      g.lineTo(x, y);
      g.stroke();
      g.globalAlpha = opacity + 0.15;
      g.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      if (star.depth > 0.77)
        glow(color, x, y, 5 + star.depth * 5, opacity * 0.7);
    }
    g.restore();
  };
  function glow(color, x, y, radius, alpha) {
    if (!glows.has(color)) {
      const image = game.environment.document.createElement("canvas");
      image.width = image.height = 192;
      const context = image.getContext("2d");
      const gradient = context.createRadialGradient(96, 96, 0, 96, 96, 96);
      gradient.addColorStop(0, color + "bb");
      gradient.addColorStop(0.35, color + "55");
      gradient.addColorStop(1, color + "00");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 192, 192);
      glows.set(color, image);
    }
    g.globalAlpha = alpha;
    g.drawImage(
      glows.get(color),
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
    );
    g.globalAlpha = 1;
  }
  function stars(id, t, w, h) {
    const profile = profiles[id];
    for (let index = 0; index < fields[id].length; index++) {
      const star = fields[id][index];
      let x = wrap(star.x * w + t * profile.drift * star.depth, w);
      let y = wrap(star.y * h + t * profile.speed * star.depth, h);
      if (id === "ocean" || id === "embers")
        x = wrap(x + Math.sin(t * 0.4 + star.phase) * 15 * star.depth, w);
      if (id === "nebula" || id === "cosmic")
        x = wrap(x + Math.sin(t * 0.12 + star.phase) * 22, w);
      const size = profile.size * star.size * (0.55 + star.depth * 0.5);
      g.globalAlpha =
        profile.opacity *
        (0.45 +
          star.depth * 0.35 +
          Math.sin(t * (0.4 + star.depth) + star.phase) * 0.18);
      g.fillStyle = profile.colors[index % profile.colors.length];
      if (id === "ocean") {
        g.beginPath();
        g.arc(x, y, size, 0, tau);
        g.fill();
      } else g.fillRect(x, y, size, id === "embers" ? size * 3 : size);
      if (id === "stars" && index % 19 === 0) {
        g.fillRect(x - 3, y, 7, 0.7);
        g.fillRect(x, y - 3, 0.7, 7);
      }
    }
    g.globalAlpha = 1;
  }
  const sceneRates = {
    void: 1.5,
    stars: 1.6,
    grid: 1.7,
    embers: 1.7,
    ocean: 1.6,
    aurora: 1.8,
    nebula: 2.1,
    matrix: 1.6,
    galaxy: 2,
    eclipse: 2.1,
    warp: 1.7,
    cosmic: 2.1,
  };
  game.drawBackground = function drawBackground(dt) {
    if (
      !["paused", "countdown"].includes(state.mode) &&
      !game.environment.document.hidden
    ) {
      state.backgroundTime += Math.max(0, Math.min(dt, 0.04));
    }
    const id = profiles[state.background] ? state.background : "void";
    const theme = OrbLift.content.backgrounds.find(
      (background) => background.id === id,
    );
    const w = Math.max(1, state.w),
      h = Math.max(1, state.h),
      t = state.backgroundTime * sceneRates[id];
    g.save();
    g.fillStyle = theme.base;
    g.fillRect(0, 0, w, h);
    game.drawEnvironmentArt(id, state.backgroundTime, w, h);
    stars(id, t, w, h);
    game.drawBackgroundFormation(id,t,w,h);
    game.drawFallingStars(id, state.backgroundTime, w, h);
    g.restore();
    g.globalAlpha = 1;
  };
};
