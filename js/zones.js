"use strict";

OrbLift.installCosmicZones = function installCosmicZones(game) {
  const { state, $, g, clamp } = game;
  const settings = OrbLift.cosmicSettings;
  const tau = Math.PI * 2;
  const rgba = (color, alpha) =>
    `rgba(${color.map(Math.round).join(",")},${alpha})`;
  game.zoneStartAt = (index) =>
    index * settings.firstZoneMeters +
    (settings.zoneLengthGrowth * index * (index - 1)) / 2;
  game.milestoneRewardAt = (index) =>
    index < 1
      ? 0
      : settings.firstMilestoneCoins +
        (settings.milestoneCoinGrowth * index * (index - 1)) / 2;
  game.totalMilestoneRewards = (index) =>
    index * settings.firstMilestoneCoins +
    (settings.milestoneCoinGrowth * index * (index - 1) * (index + 1)) / 6;
  const generated = new Map();
  const adjectives = [
    "Prismatic",
    "Astral",
    "Obsidian",
    "Radiant",
    "Ethereal",
    "Sapphire",
    "Crimson",
    "Opaline",
    "Spectral",
    "Luminous",
    "Silent",
    "Infinite",
    "Empyreal",
    "Stellar",
    "Velvet",
    "Iridescent",
  ];
  const places = [
    "Nebula",
    "Expanse",
    "Horizon",
    "Cascade",
    "Sanctum",
    "Vortex",
    "Halo",
    "Tide",
    "Cradle",
    "Labyrinth",
    "Crown",
    "Ocean",
    "Citadel",
    "Bloom",
    "Veil",
    "Frontier",
  ];
  game.zoneDefinitionAt = function zoneDefinitionAt(index) {
    if (index < settings.zones.length) return settings.zones[index];
    if (generated.has(index)) return generated.get(index);
    const ordinal = index - settings.zones.length;
    const hue = (ordinal * 137.507764 + 195) % 360;
    const color = [0, 120, 240].map((offset) =>
      Math.round(145 + 100 * Math.cos(((hue + offset) * Math.PI) / 180)),
    );
    const sector = Math.floor(ordinal / (adjectives.length * places.length));
    const definition = {
      name:
        adjectives[ordinal % adjectives.length] +
        " " +
        places[Math.floor(ordinal / adjectives.length) % places.length] +
        (sector ? " · Sector " + (sector + 1) : ""),
      color,
      accent: `hsl(${(hue + 55) % 360},95%,76%)`,
      signature: 1 + (ordinal % 4),
      motion: 0.7 + ((ordinal * 37) % 101) / 80,
      valuableCoins: true,
    };
    if (generated.size >= 4) generated.delete(generated.keys().next().value);
    generated.set(index, definition);
    return definition;
  };
  game.zoneAt = function zoneAt(distance = state.distance) {
    distance = Math.max(0, distance);
    const linear = settings.firstZoneMeters - settings.zoneLengthGrowth / 2;
    let milestone = Math.floor(
      (2 * distance) /
        (linear +
          Math.sqrt(linear ** 2 + 2 * settings.zoneLengthGrowth * distance)),
    );
    if (game.zoneStartAt(milestone + 1) <= distance) milestone++;
    if (game.zoneStartAt(milestone) > distance) milestone--;
    const start = game.zoneStartAt(milestone),
      next = game.zoneStartAt(milestone + 1);
    return {
      milestone,
      index: milestone,
      start,
      next,
      progress: (distance - start) / (next - start),
      definition: game.zoneDefinitionAt(milestone),
    };
  };
  game.zoneDifficulty = () =>
    1 +
    settings.cycleDifficultyGrowth *
      (1 -
        Math.exp(
          -Math.max(0, state.distance) /
            (settings.firstZoneMeters * settings.zones.length),
        ));
  game.resetCosmicZones = function resetCosmicZones(randomize = true) {
    const color = settings.zones[0].color;
    state.cosmic = {
      milestone: 0,
      index: 0,
      fromIndex: 0,
      color: [...color],
      from: [...color],
      target: [...color],
      transition: 1,
      announcement: 0,
      announcementAltitude: 0,
      announcementBonus: 0,
      rushMilestone: 0,
      rushRemaining: 0,
      rushBlend: 0,
      showerRemaining: 0,
      showerClock: 0,
      showerCooldown: randomize
        ? game.rnd(settings.showerWaitMinimum, settings.showerWaitMaximum)
        : settings.showerWaitMaximum,
      showerWave: 0,
    };
    game.updateCosmicHUD();
  };
  game.syncZoneMilestones = function syncZoneMilestones(updateHUD = true) {
    const cosmic = state.cosmic,
      zone = game.zoneAt();
    if (zone.milestone > cosmic.milestone) {
      const bonus =
        game.totalMilestoneRewards(zone.milestone) -
        game.totalMilestoneRewards(cosmic.milestone);
      state.runCoins += bonus;
      cosmic.milestone = zone.milestone;
      cosmic.announcement = settings.announcementSeconds;
      cosmic.announcementAltitude = zone.start;
      cosmic.announcementBonus = bonus;
      $("runCoins").textContent = "+" + state.runCoins.toLocaleString();
      cosmic.from = [...cosmic.color];
      cosmic.target = [...zone.definition.color];
      cosmic.transition = 0;
      cosmic.fromIndex = cosmic.index;
    }
    cosmic.index = zone.index;
    if (updateHUD) game.updateCosmicHUD();
  };
  // Invert the monotonic base-distance integral only at event boundaries.
  // Fixed bisection work keeps triggers consistent across 30/60/120 fps.
  function crossingTime(start, end, baseDistance) {
    const origin = game.distanceAt(start);
    for (let iteration = 0; iteration < 36; iteration++) {
      const middle = (start + end) / 2;
      if (game.distanceAt(middle) - origin < baseDistance) start = middle;
      else end = middle;
    }
    return (start + end) / 2;
  }
  game.advanceCosmicDistance = function advanceCosmicDistance(start, dt) {
    const cosmic = state.cosmic;
    const crossedBefore = Math.floor(state.distance / settings.rushMeters);
    if (crossedBefore > cosmic.rushMilestone) {
      cosmic.rushMilestone = crossedBefore;
      cosmic.rushRemaining = settings.rushSeconds;
    }
    let cursor = start,
      remaining = dt;
    for (let segment = 0; segment < 4 && remaining > 1e-10; segment++) {
      const active = cosmic.rushRemaining > 0;
      let duration = active
        ? Math.min(remaining, cosmic.rushRemaining)
        : remaining;
      const ratio = active ? 1 + settings.rushDistanceBonus : 1;
      const base = game.distanceAt(cursor + duration) - game.distanceAt(cursor);
      const next = (cosmic.rushMilestone + 1) * settings.rushMeters;
      if (!active && state.distance + base >= next) {
        duration =
          crossingTime(cursor, cursor + duration, next - state.distance) -
          cursor;
        state.distance = next;
        cosmic.rushMilestone++;
        cosmic.rushRemaining = settings.rushSeconds;
      } else {
        const before = state.distance;
        state.distance += base * ratio;
        cosmic.rushRemaining = Math.max(0, cosmic.rushRemaining - duration);
        const crossed = Math.floor(state.distance / settings.rushMeters);
        if (crossed > cosmic.rushMilestone) {
          const last = crossed * settings.rushMeters;
          const at = crossingTime(
            cursor,
            cursor + duration,
            (last - before) / ratio,
          );
          cosmic.rushRemaining = Math.max(
            0,
            settings.rushSeconds - (cursor + duration - at),
          );
          cosmic.rushMilestone = crossed;
        }
      }
      cursor += duration;
      remaining -= duration;
    }
    // Runtime frames are capped at 40 ms. This bounded fallback also supports
    // deliberately huge simulation steps without a loop per crossed milestone.
    if (remaining > 1e-10) {
      state.distance +=
        (game.distanceAt(cursor + remaining) - game.distanceAt(cursor)) *
        (cosmic.rushRemaining > 0 ? 1 + settings.rushDistanceBonus : 1);
      const crossed = Math.floor(state.distance / settings.rushMeters);
      if (crossed > cosmic.rushMilestone)
        cosmic.rushRemaining = settings.rushSeconds;
      cosmic.rushMilestone = Math.max(cosmic.rushMilestone, crossed);
    }
    game.syncZoneMilestones(false);
  };
  game.spawnCoinShower = function spawnCoinShower() {
    const cosmic = state.cosmic;
    const center = state.w * (0.5 + Math.sin(cosmic.showerWave * 0.7) * 0.26);
    const group = [];
    for (let index = 0; index < 5; index++) {
      const coin = game.createCoin(
        center + (index - 2) * 28,
        -42 - Math.abs(index - 2) * 30,
      );
      if (game.zoneAt().definition.valuableCoins && index % 2 === 0)
        coin.value = 2;
      group.push(coin);
    }
    cosmic.showerWave++;
    return game.spawnGroup(group);
  };
  game.celestialCoins = function celestialCoins(center) {
    if (!game.zoneAt().definition.valuableCoins) return null;
    return Array.from({ length: 5 }, (_, index) => ({
      ...game.createCoin(
        center + (index - 2) * 28,
        -40 - Math.abs(index - 2) * 30,
      ),
      value: 2,
    }));
  };
  game.updateCosmicEvents = function updateCosmicEvents(dt) {
    const cosmic = state.cosmic;
    cosmic.announcement = Math.max(0, cosmic.announcement - dt);
    cosmic.transition = Math.min(
      1,
      cosmic.transition + dt / settings.transitionSeconds,
    );
    const blend = cosmic.transition ** 2 * (3 - 2 * cosmic.transition);
    for (let index = 0; index < 3; index++)
      cosmic.color[index] =
        cosmic.from[index] +
        (cosmic.target[index] - cosmic.from[index]) * blend;
    cosmic.rushBlend +=
      ((cosmic.rushRemaining > 0 ? 1 : 0) - cosmic.rushBlend) *
      (1 - Math.exp(-dt * 7));
    if (cosmic.showerRemaining > 0) {
      const activeTime = Math.min(dt, cosmic.showerRemaining);
      cosmic.showerRemaining = Math.max(0, cosmic.showerRemaining - dt);
      cosmic.showerClock += activeTime;
      if (cosmic.showerClock >= settings.showerCoinInterval) {
        cosmic.showerClock %= settings.showerCoinInterval;
        game.spawnCoinShower();
      }
    } else {
      cosmic.showerCooldown -= dt;
      if (cosmic.showerCooldown <= 0) {
        cosmic.showerRemaining = settings.showerSeconds;
        cosmic.showerClock = 0;
        cosmic.showerCooldown = game.rnd(
          settings.showerWaitMinimum,
          settings.showerWaitMaximum,
        );
      }
    }
    game.updateCosmicHUD();
  };
  game.finishCosmicEvents = function finishCosmicEvents() {
    const cosmic = state.cosmic;
    cosmic.rushRemaining =
      cosmic.rushBlend =
      cosmic.showerRemaining =
      cosmic.announcement =
        0;
    game.updateCosmicHUD();
  };
  game.decorateBarrier = function decorateBarrier(object) {
    const distance = state.distance,
      phase = Math.random() * tau;
    object.baseR = object.r;
    if (
      distance >= settings.pulsingUnlock &&
      Math.random() < settings.pulsingChance
    ) {
      object.variant = "pulsing";
      object.maxR = object.r * (1 + settings.pulseAmount);
    } else if (
      distance >= settings.movingUnlock &&
      Math.random() < settings.movingChance
    ) {
      object.variant = "moving";
      object.travel = Math.min(settings.movingTravel, state.w * 0.08);
    }
    object.phase = phase;
    object.born = state.time;
    return object;
  };
  game.moveBarrier = function moveBarrier(object) {
    const age = state.time - object.born;
    if (object.variant === "moving")
      object.x =
        object.anchorX +
        Math.sin(age * settings.movingFrequency + object.phase) * object.travel;
    if (object.variant === "pulsing")
      object.r =
        object.baseR *
        (1 +
          Math.sin(age * settings.pulseFrequency + object.phase) *
            settings.pulseAmount);
  };
  game.hasSafePath = function hasSafePath(proposals) {
    const barriers = [...state.objects, ...proposals].filter(
      (object) => object.kind === "barrier",
    );
    const newBarriers = proposals.filter((object) => object.kind === "barrier");
    const edge = state.ball.r + 8;
    for (const focus of newBarriers) {
      const intervals = barriers
        .filter(
          (object) =>
            Math.abs(object.y - focus.y) <=
            game.spawnRadius(object) + game.spawnRadius(focus) + edge * 2,
        )
        .map((object) => [
          game.spawnCenterX(object) - game.spawnRadius(object) - edge,
          game.spawnCenterX(object) + game.spawnRadius(object) + edge,
        ])
        .sort((first, second) => first[0] - second[0]);
      let cursor = edge,
        widest = 0;
      for (const [left, right] of intervals) {
        widest = Math.max(widest, Math.min(state.w - edge, left) - cursor);
        cursor = Math.max(cursor, right);
      }
      widest = Math.max(widest, state.w - edge - cursor);
      if (widest < settings.minimumPathWidth) return false;
    }
    return game.hasReachablePath(proposals);
  };
  game.zoneObstacleColor = () => rgba(state.cosmic.color, 1);
  game.updateCosmicHUD = function updateCosmicHUD() {
    const cosmic = state.cosmic;
    if (!cosmic) return;
    const zone = game.zoneAt(),
      active = state.mode === "play";
    const color = game.zoneObstacleColor();
    game.setStyle("zoneHUD", "display", active ? "block" : "none");
    game.setStyle("zoneHUD", "opacity", cosmic.announcement > 0 ? 0 : 1);
    game.setText("zoneName", "✦ " + zone.definition.name);
    game.setStyle("zoneName", "color", color);
    game.setStyle("zoneProgressFill", "width", zone.progress * 100 + "%");
    game.setStyle("zoneProgressFill", "background", color);
    game.setAttribute(
      "zoneProgress",
      "aria-valuenow",
      Math.floor(zone.progress * 100),
    );
    game.setText("zoneNext", zone.next.toLocaleString() + " m");
    game.setStyle(
      "zoneAnnouncement",
      "display",
      active && cosmic.announcement > 0 ? "flex" : "none",
    );
    game.setStyle(
      "zoneAnnouncement",
      "opacity",
      Math.min(1, cosmic.announcement / 0.35),
    );
    game.setText("zoneTitle", zone.definition.name);
    game.setStyle("zoneTitle", "color", color);
    game.setText(
      "zoneAltitude",
      cosmic.announcementAltitude.toLocaleString() + "m",
    );
    game.setText("zoneReward", "● +" + cosmic.announcementBonus);
    game.setStyle("cosmicEvents", "display", active ? "flex" : "none");
    game.setStyle(
      "rushBadge",
      "display",
      cosmic.rushRemaining > 0 ? "inline-block" : "none",
    );
    game.setText(
      "rushBadge",
      "SPEED RUSH · " + Math.ceil(cosmic.rushRemaining) + "s",
    );
    game.setStyle(
      "showerBadge",
      "display",
      cosmic.showerRemaining > 0 ? "inline-block" : "none",
    );
    game.setText(
      "showerBadge",
      "COIN SHOWER · " + Math.ceil(cosmic.showerRemaining) + "s",
    );
  };
  game.drawCosmicZones = function drawCosmicZones() {
    if (!["play", "launch", "paused", "countdown"].includes(state.mode)) return;
    const cosmic = state.cosmic,
      w = state.w,
      h = state.h,
      t = state.time * (game.zoneDefinitionAt(state.cosmic.index).motion ?? 1);
    g.save();
    g.fillStyle = rgba(cosmic.color, 0.07);
    g.fillRect(0, 0, w, h);
    const accent = game.zoneDefinitionAt(cosmic.index).accent;
    // Fixed budgets: colored drift, boundary lightning, solar/rift/realm details.
    for (let index = 0; index < 16; index++) {
      const y = ((index * 137.7 + t * (22 + (index % 3) * 9)) % (h + 30)) - 15;
      const x = (((index * 97.3 + Math.sin(t * 0.2 + index) * 20) % w) + w) % w;
      g.fillStyle = rgba(cosmic.color, 0.18 + (index % 3) * 0.06);
      g.fillRect(x, y, 1 + (index % 2), 3 + (index % 4));
    }
    // Blend luminous particle volumes over the equipped environment.
    for (const index of new Set([cosmic.fromIndex,cosmic.index])) {
      const weight=index===cosmic.index?cosmic.transition:1-cosmic.transition;
      if(weight>0) game.drawZoneFormation(game.zoneDefinitionAt(index),index,state.time,w,h,weight);
    }
    if (cosmic.rushBlend > 0.01) {
      g.strokeStyle = accent;
      g.globalAlpha = cosmic.rushBlend * 0.25;
      g.lineWidth = 1.5;
      for (let index = 0; index < 22; index++) {
        const x = (index * 113.7) % w,
          y = ((index * 173 + t * 300) % (h + 120)) - 60;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 35 + (index % 5) * 10);
        g.stroke();
      }
    }
    g.restore();
  };
  game.resetCosmicZones(false);
};
