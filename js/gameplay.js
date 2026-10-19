"use strict";
// Install gameplay behavior on a single game instance.
OrbLift.installGameplay = function (game) {
  const state = game.state;
  const { $, rnd, clamp } = game;
  const { safeStorage } = game.storage;
  const balance = OrbLift.balance;
  // Mild linear growth has no ceiling; altitude primarily changes arrangements.
  game.obstacleSpeedAt = function obstacleSpeedAt(seconds) {
    return (
      balance.startingSpeed + Math.max(0, seconds) * balance.speedAcceleration
    );
  };
  game.spawnIntervalAt = (distance = state.distance) =>
    balance.minimumSpawnInterval +
    (balance.startingSpawnInterval - balance.minimumSpawnInterval) *
      Math.exp(-Math.max(0, distance) / balance.densityAltitudeScale);
  // Integral of an independent, gradually accelerating meters-per-second curve.
  game.distanceAt = function distanceAt(seconds) {
    return (
      balance.startingDistanceRate * seconds +
      (balance.distanceRateGrowth * seconds ** 2) / 2 +
      (balance.distanceRateAcceleration * seconds ** 3) / 6
    );
  };
  game.start = function start() {
    state.recordedDistance = 0;
    state.recordedCoins = 0;
    state.runCounted = false;
    state.mode = "launch";
    state.launchElapsed = 0;
    state.launchParticles = Array.from(
      {
        length: 105,
      },
      (_, i) => {
        const a = i * 2.3999632297,
          velocity = 110 + Math.random() * 470;
        return {
          a,
          v: velocity,
          r: 1 + Math.random() * 3.8,
          spin: Math.random() * 6.28,
          hue: i % 4,
        };
      },
    );
    state.revives = 0;
    state.reviveCountdown = 0;
    game.updateReviveCountdown();
    state.creditedCoins = 0;
    $("shield").textContent = "";
    state.invincible = 0;
    game.showMain();
    state.time =
      state.distance =
      state.runCoins =
      state.spawn =
      state.shield =
      state.coinBoost =
        0;
    state.coinMultiplier = 1;
    state.magnet = state.coinSpawn = 0;
    state.patternSide = 0;
    game.resetCosmicZones();
    game.updateMultiplierHUD();
    $("coinRate").textContent = "1×";
    state.speed = balance.startingSpeed;
    state.objects = [];
    state.sparks = [];
    state.ball.x = state.ball.target = state.w / 2;
    $("distance").textContent = "0";
    $("runCoins").textContent = "+0";
    $("panel").classList.add("hidden");
    $("pause").style.display = "block";
    $("pause").textContent = "Ⅱ";
  };
  game.end = function end() {
    if (state.mode !== "play") return;
    game.recordRun();
    $("shield").textContent = "";
    state.mode = "over";
    game.finishCosmicEvents();
    state.coinBoost = 0;
    state.coinMultiplier = 1;
    state.magnet = 0;
    game.updateMultiplierHUD();
    $("coinRate").textContent = "1×";
    state.bank += Math.max(0, state.runCoins - state.creditedCoins);
    state.creditedCoins = state.runCoins;
    safeStorage.setItem("neonRushBank", state.bank);
    const meters = Math.floor(state.distance);
    if (meters > state.best) {
      state.best = meters;
      safeStorage.setItem("neonRushDistanceBest", state.best);
    }
    $("bank").textContent = state.bank;
    $("best").textContent = state.best + " m";
    $("message").innerHTML =
      'You traveled <b style="color:#ff62b9">' +
      meters.toLocaleString() +
      ' meters</b> and collected <b style="color:#ffdc65">' +
      state.runCoins +
      " coins</b> this run.";
    $("summary").textContent = "● " + state.bank + " total coins saved";
    $("start").textContent = "PLAY AGAIN →";
    game.showMain();
    game.renderRevive();
    $("panel").classList.remove("hidden");
    $("pause").style.display = "none";
  };
  // Rotating squares are reserved by their full diagonal, not their inscribed
  // collision circle. Rewards additionally reserve space for the player's orb.
  game.spawnRadius = (object) =>
    object.kind === "barrier"
      ? (object.maxR ?? object.r) * Math.SQRT2 + (object.travel ?? 0)
      : object.r;
  game.spawnCenterX = (object) => object.anchorX ?? object.x;
  game.spawnClearance = function spawnClearance(first, second) {
    const hazardous = first.kind === "barrier" || second.kind === "barrier";
    return (
      game.spawnRadius(first) +
      game.spawnRadius(second) +
      balance.spawnGap +
      (hazardous ? balance.hazardPickupClearance : 0)
    );
  };
  // Sweep conservative hazard envelopes through time. Reachable intervals expand
  // only inside one free corridor, never through an intervening barrier.
  game.hasReachablePath = function hasReachablePath(proposals) {
    const edge = state.ball.r + 8;
    // Bound speed over these objects' remaining flight, rather than assuming a
    // global speed cap. Base-speed travel time is conservative even during rushes.
    const horizon = Math.max(
      0,
      ...[...state.objects, ...proposals].map(
        (object) =>
          (state.ball.y - object.y + game.spawnRadius(object) + edge) /
          game.obstacleSpeedAt(state.time),
      ),
    );
    const speed =
      game.obstacleSpeedAt(state.time + horizon) *
      (1 + OrbLift.cosmicSettings.rushSpeedBonus);
    const hazards = [...state.objects, ...proposals]
      .filter((object) => object.kind === "barrier")
      .map((object) => {
        const radius = game.spawnRadius(object) + edge;
        return {
          left: game.spawnCenterX(object) - radius,
          right: game.spawnCenterX(object) + radius,
          enter: Math.max(0, (state.ball.y - object.y - radius) / speed),
          exit: (state.ball.y - object.y + radius) / speed,
        };
      })
      .filter((hazard) => hazard.exit > 0);
    if (!hazards.length) return true;
    const rewards = proposals.filter((object) => object.kind !== "barrier");
    const reward = rewards[Math.floor(rewards.length / 2)];
    const rewardTime = reward
      ? Math.max(0, (state.ball.y - reward.y) / speed)
      : null;
    const times = [
      ...new Set([
        0,
        ...hazards.flatMap((hazard) => [hazard.enter, hazard.exit]),
        ...(rewardTime === null ? [] : [rewardTime]),
      ]),
    ].sort((a, b) => a - b);
    let reachable = [[state.ball.x, state.ball.x]];
    for (let index = 1; index < times.length; index++) {
      const start = times[index - 1],
        end = times[index];
      const blocked = hazards
        .filter((hazard) => hazard.enter < end && hazard.exit > start)
        .sort((a, b) => a.left - b.left);
      const free = [];
      let cursor = edge;
      for (const hazard of blocked) {
        if (hazard.left > cursor)
          free.push([cursor, Math.min(state.w - edge, hazard.left)]);
        cursor = Math.max(cursor, hazard.right);
      }
      if (cursor < state.w - edge) free.push([cursor, state.w - edge]);
      const travel =
        balance.safeSteeringSpeed *
        Math.max(0, end - Math.max(start, balance.reactionSeconds));
      const next = [];
      for (const [left, right] of free)
        for (const [from, to] of reachable) {
          const low = Math.max(left, from),
            high = Math.min(right, to);
          if (low <= high)
            next.push([
              Math.max(left, low - travel),
              Math.min(right, high + travel),
            ]);
        }
      reachable = [];
      for (const interval of next.sort((a, b) => a[0] - b[0])) {
        const last = reachable.at(-1);
        if (last && interval[0] <= last[1])
          last[1] = Math.max(last[1], interval[1]);
        else reachable.push(interval);
      }
      if (end === rewardTime) {
        const radius = reward.r + state.ball.r - 3;
        reachable = reachable
          .map(([left, right]) => [
            Math.max(left, reward.x - radius),
            Math.min(right, reward.x + radius),
          ])
          .filter(([left, right]) => left <= right);
      }
      if (!reachable.length) return false;
    }
    return true;
  };
  game.spawnGroup = function spawnGroup(proposals) {
    if (!proposals.length) return false;
    const left = Math.min(
      ...proposals.map((object) => object.x - game.spawnRadius(object)),
    );
    const right = Math.max(
      ...proposals.map((object) => object.x + game.spawnRadius(object)),
    );
    const minimumShift = 8 - left,
      maximumShift = state.w - 8 - right;
    if (minimumShift > maximumShift) return false;
    for (let attempt = 0; attempt < balance.spawnAttempts; attempt++) {
      const shift =
        attempt === 0
          ? clamp(0, minimumShift, maximumShift)
          : minimumShift +
            (maximumShift - minimumShift) * ((attempt * 0.61803398875) % 1);
      const placed = proposals.map((object) => ({
        ...object,
        x: object.x + shift,
      }));
      let safe = true;
      for (let index = 0; index < placed.length && safe; index++) {
        const object = placed[index];
        for (
          let otherIndex = 0;
          otherIndex < state.objects.length + index;
          otherIndex++
        ) {
          const other =
            otherIndex < state.objects.length
              ? state.objects[otherIndex]
              : placed[otherIndex - state.objects.length];
          if (
            Math.hypot(
              object.x - game.spawnCenterX(other),
              object.y - other.y,
            ) < game.spawnClearance(object, other)
          ) {
            safe = false;
            break;
          }
        }
      }
      if (safe && game.hasSafePath(placed)) {
        for (const object of placed)
          if (object.variant === "moving") object.anchorX = object.x;
        state.objects.push(...placed);
        return true;
      }
    }
    // Skip a crowded group rather than hiding a reward inside a hazard.
    return false;
  };
  game.createCoin = function createCoin(x, y) {
    return {
      kind: "coin",
      x,
      y,
      r: balance.coinRadius,
      value: Math.random() < balance.goldCoinChance ? 2 : 1,
      angle: 0,
      spin: 2,
    };
  };
  game.add = function add() {
    const group = [];
    const x = rnd(30, Math.max(31, state.w - 30)),
      p = Math.random();
    if (p < balance.barrierChance) {
      group.push({
        kind: "barrier",
        x,
        y: -45,
        r: rnd(16, 24),
        angle: rnd(0, 6),
        spin: rnd(-2, 2),
      });
      if (state.time > 18 && state.w > 260 && Math.random() < 0.28)
        group.push({
          kind: "barrier",
          x: clamp(
            x + (Math.random() < 0.5 ? -1 : 1) * rnd(95, 150),
            28,
            state.w - 28,
          ),
          y: -45,
          r: 19,
          angle: 0,
          spin: 1,
        });
    } else if (p < balance.barrierChance + balance.coinChance) {
      const count =
        Math.random() < balance.coinGroupChance
          ? Math.random() < 0.5
            ? 5
            : 7
          : 1;
      for (let i = 0; i < count; i++)
        group.push(game.createCoin(x, -38 - i * 37));
    } else {
      const kind =
        p <
        balance.barrierChance + balance.coinChance + balance.multiplierChance
          ? "multiplier"
          : "shield";
      group.push({
        kind,
        x,
        y: -35,
        r: kind === "multiplier" ? balance.multiplierRadius : 13,
        angle: 0,
        spin: 2,
      });
    }
    for (const object of group)
      if (object.kind === "barrier") game.decorateBarrier(object);
    if (
      group[0]?.kind === "barrier" &&
      state.distance >= balance.patternUnlock &&
      Math.random() <
        balance.maximumPatternChance *
          (1 -
            Math.exp(
              (-(state.distance - balance.patternUnlock) *
                game.zoneDifficulty()) /
                balance.patternAltitudeScale,
            ))
    ) {
      const first = group[0];
      first.r = first.baseR = 16;
      if (first.variant === "pulsing")
        first.maxR = first.r * (1 + OrbLift.cosmicSettings.pulseAmount);
      const second = game.decorateBarrier({
        ...first,
        variant: undefined,
        travel: undefined,
        maxR: undefined,
      });
      const gap = Math.max(balance.patternGap, state.ball.r * 2 + 48);
      const center = state.w * (state.patternSide % 2 ? 0.6 : 0.4);
      first.x = center - gap / 2 - game.spawnRadius(first);
      second.x = center + gap / 2 + game.spawnRadius(second);
      first.pattern = second.pattern = "alternating";
      group.splice(0, group.length, first, second);
    }
    if (
      group.length === 2 &&
      group[0].kind === "barrier" &&
      Math.hypot(group[0].x - group[1].x, group[0].y - group[1].y) <
        game.spawnClearance(group[0], group[1])
    ) {
      group.pop();
    }
    const placed = game.spawnGroup(group);
    if (placed && group[0]?.pattern === "alternating") state.patternSide++;
    return placed;
  };
  // A separate reward cadence preserves every existing barrier/power-up probability.
  game.addCoinBonus = function addCoinBonus() {
    const group = [];
    const x = rnd(36, Math.max(37, state.w - 36));
    const count = Math.random() < 0.7 ? 5 : 7;
    const pattern = Math.random();
    for (let index = 0; index < count; index++) {
      const cluster = pattern > 0.66;
      const offset = cluster
        ? index % 2
          ? 19
          : -19
        : Math.sin(index * 0.65 + pattern * Math.PI) *
          (pattern < 0.33 ? 20 : 45);
      group.push(
        game.createCoin(
          clamp(x + offset, 24, state.w - 24),
          -38 - (cluster ? Math.floor(index / 2) : index) * 34,
        ),
      );
    }
    let coinsPlaced = game.spawnGroup(game.celestialCoins(x) ?? group);
    if (!coinsPlaced) {
      // Dense rows can reject a wide trail. Offer a narrow column through a
      // recently spawned gap, using the same clearance and reachability checks.
      const row = state.objects
        .filter(
          (object) =>
            object.kind === "barrier" && Math.abs(object.y + 45) < 100,
        )
        .sort((a, b) => game.spawnCenterX(a) - game.spawnCenterX(b));
      const lane =
        row.length > 1
          ? (game.spawnCenterX(row[0]) + game.spawnCenterX(row[1])) / 2
          : state.ball.x;
      coinsPlaced = game.spawnGroup(
        Array.from({ length: 5 }, (_, index) =>
          game.createCoin(lane, -38 - index * 37),
        ),
      );
    }
    let magnetPlaced = false;
    if (Math.random() < balance.bonusMagnetChance) {
      magnetPlaced = game.spawnGroup([
        {
          kind: "magnet",
          x,
          y: -80 - count * 37,
          r: balance.magnetPickupRadius,
          angle: 0,
          spin: 0.35,
        },
      ]);
    }
    return coinsPlaced || magnetPlaced;
  };
  game.moveCoin = function moveCoin(coin, dt) {
    const dx = state.ball.x - coin.x,
      dy = state.ball.y - coin.y;
    const distance = Math.hypot(dx, dy);
    if (
      state.magnet <= 0 ||
      (!coin.magnetized && distance > balance.magnetRadius)
    ) {
      coin.magnetized = false;
      if (coin.trail) coin.trail.length = 0;
      coin.magnetVx = coin.magnetVy = undefined;
      coin.y += state.speed * dt;
      return;
    }
    coin.magnetized = true;
    if (dt === 0 || distance === 0) return;
    coin.trail ??= [];
    coin.trail.push({ x: coin.x, y: coin.y });
    if (coin.trail.length > 6) coin.trail.shift();
    const proximity = Math.max(0, 1 - distance / balance.magnetRadius);
    const speed = 220 + state.speed * 0.45 + 1200 * proximity ** 2;
    const easing = 1 - Math.exp(-dt * 10);
    coin.magnetVx =
      (coin.magnetVx ?? 0) +
      ((dx / distance) * speed - (coin.magnetVx ?? 0)) * easing;
    coin.magnetVy =
      (coin.magnetVy ?? state.speed) +
      ((dy / distance) * speed - (coin.magnetVy ?? state.speed)) * easing;
    coin.x += coin.magnetVx * dt;
    coin.y += coin.magnetVy * dt;
  };
  function circleFraction(ax, ay, bx, by, radius) {
    const c = ax * ax + ay * ay - radius * radius;
    if (c < 0) return 0;
    const dx = bx - ax,
      dy = by - ay,
      a = dx * dx + dy * dy;
    if (!a) return null;
    const b = ax * dx + ay * dy,
      discriminant = b * b - a * c;
    if (discriminant <= 0) return null;
    const time = (-b - Math.sqrt(discriminant)) / a;
    return time >= 0 && time <= 1 ? time : null;
  }
  // Sweep the orb against the visible rotated square (rounded Minkowski box),
  // rather than an inscribed circle that lets the player clip its corners.
  game.contactFraction = function contactFraction(
    object,
    ax,
    ay,
    bx,
    by,
    radius = object.r,
    angle = object.angle || 0,
  ) {
    const padding = state.ball.r - 3;
    if (object.kind !== "barrier")
      return circleFraction(ax, ay, bx, by, radius + padding);
    if (circleFraction(ax, ay, bx, by, radius * Math.SQRT2 + padding) === null)
      return null;
    const cosine = Math.cos(angle),
      sine = Math.sin(angle);
    const x = ax * cosine + ay * sine,
      y = ay * cosine - ax * sine;
    const endX = bx * cosine + by * sine,
      endY = by * cosine - bx * sine;
    if (
      Math.hypot(
        Math.max(0, Math.abs(x) - radius),
        Math.max(0, Math.abs(y) - radius),
      ) < padding
    )
      return 0;
    const dx = endX - x,
      dy = endY - y;
    let first = Infinity;
    for (const sign of [-1, 1]) {
      if (dx) {
        const time = (sign * (radius + padding) - x) / dx;
        if (time >= 0 && time <= 1 && Math.abs(y + dy * time) <= radius)
          first = Math.min(first, time);
      }
      if (dy) {
        const time = (sign * (radius + padding) - y) / dy;
        if (time >= 0 && time <= 1 && Math.abs(x + dx * time) <= radius)
          first = Math.min(first, time);
      }
      for (const other of [-1, 1]) {
        const time = circleFraction(
          x - sign * radius,
          y - other * radius,
          endX - sign * radius,
          endY - other * radius,
          padding,
        );
        if (time !== null) first = Math.min(first, time);
      }
    }
    return Number.isFinite(first) ? first : null;
  };
  // Pointer sweeps and vertical world motion share exactly one payout/damage path.
  game.resolveContact = function resolveContact(o) {
    if (o.kind === "coin") {
      state.runCoins += (o.value === 2 ? 2 : 1) * Math.min(state.coinMultiplier,balance.maximumCoinMultiplier);
      $("runCoins").textContent = "+" + state.runCoins.toLocaleString();
      game.burst(o.x, o.y, o.value === 2 ? "#e4a62d" : "#ffdc65");
    } else if (o.kind === "magnet") {
      state.magnet = balance.magnetSeconds;
      game.updateMagnetHUD();
      game.burst(o.x, o.y, "#48bcff");
    } else if (o.kind === "shield") {
      state.shield = 6;
      game.burst(o.x, o.y, "#67eaff");
    } else if (o.kind === "multiplier") {
      state.coinMultiplier =
        state.coinBoost > 0 ? Math.min(state.coinMultiplier * 2, balance.maximumCoinMultiplier) : 2;
      state.coinBoost = 10;
      game.updateMultiplierHUD();
      game.burst(o.x, o.y, "#b16bff");
    } else if (state.invincible > 0) {
      game.burst(o.x, o.y, "#ffffff");
    } else if (state.shield > 0) {
      state.shield = 0;
      game.burst(o.x, o.y, "#67eaff");
    } else {
      game.burst(state.ball.x, state.ball.y, "#ff3e9d");
      game.end();
    }
    game.updateShieldHUD();
  };
  game.steer = function steer(x) {
    if (!Number.isFinite(x)) return;
    const previousX = state.ball.x;
    state.ball.x = state.ball.target = clamp(
      x,
      state.ball.r + 8,
      state.w - state.ball.r - 8,
    );
    if (state.mode !== "play" || state.ball.x === previousX) return;
    const contacts = [];
    for (const object of state.objects) {
      const fraction = game.contactFraction(
        object,
        previousX - object.x,
        state.ball.y - object.y,
        state.ball.x - object.x,
        state.ball.y - object.y,
      );
      if (fraction !== null) contacts.push({ object, fraction });
    }
    contacts.sort((a, b) => a.fraction - b.fraction);
    for (const { object } of contacts) {
      const index = state.objects.indexOf(object);
      if (index < 0) continue;
      state.objects.splice(index, 1);
      game.resolveContact(object);
      if (state.mode !== "play") break;
    }
  };
  game.toggle = function toggle() {
    if (["play", "launch", "countdown"].includes(state.mode)) {
      state.pausedFrom = state.mode;
      state.mode = "paused";
      game.updateReviveCountdown();
      game.updateMultiplierHUD();
      $("pause").textContent = "▶";
      game.showMain();
      $("message").textContent = "Your run is paused.";
      $("summary").textContent =
        "Distance: " + Math.floor(state.distance) + " m";
      $("start").textContent = "RESUME →";
      $("panel").classList.remove("hidden");
    } else if (state.mode === "paused") {
      state.mode = state.pausedFrom || "play";
      game.updateReviveCountdown();
      game.updateMultiplierHUD();
      $("pause").textContent = "Ⅱ";
      $("panel").classList.add("hidden");
    }
  };
  game.reviveCost = function reviveCost() {
    return [100, 250, 600][Math.min(state.revives, 2)];
  };
  game.update = function update(dt) {
    if (state.mode === "countdown") {
      state.reviveCountdown = Math.max(0, state.reviveCountdown - dt);
      if (state.reviveCountdown === 0) state.mode = "play";
      game.updateReviveCountdown();
      return;
    }
    if (state.mode !== "play") return;
    const previousTime = state.time;
    state.time += dt;
    state.coinBoost = Math.max(0, state.coinBoost - dt);
    state.magnet = Math.max(0, state.magnet - dt);
    if (state.coinBoost === 0) state.coinMultiplier = 1;
    game.updateMultiplierHUD(false);
    state.invincible = Math.max(0, state.invincible - dt);
    game.advanceCosmicDistance(previousTime, dt);
    game.updateCosmicEvents(dt);
    state.speed =
      game.obstacleSpeedAt(state.time) *
      (1 + state.cosmic.rushBlend * OrbLift.cosmicSettings.rushSpeedBonus);
    state.spawn += dt;
    state.coinSpawn += dt;
    const coinInterval = Math.max(
      balance.minimumBonusCoinInterval,
      balance.bonusCoinInterval - state.time * 0.01,
    );
    if (state.coinSpawn >= coinInterval) {
      state.coinSpawn %= coinInterval;
      game.addCoinBonus();
    }
    if (state.spawn >= game.spawnIntervalAt()) {
      state.spawn = 0;
      game.add();
    }
    state.shield = Math.max(0, state.shield - dt);
    game.updateShieldHUD();
    let contacts = null;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const object = state.objects[i];
      const previousX = object.x,
        previousY = object.y,
        previousRadius = object.r,
        previousAngle = object.angle;
      if (object.kind === "barrier") game.moveBarrier(object);
      if (object.kind === "coin") game.moveCoin(object, dt);
      else object.y += state.speed * dt;
      object.angle += object.spin * dt;
      const radius = Math.max(previousRadius, object.r);
      const ax = state.ball.x - previousX,
        ay = state.ball.y - previousY;
      const bx = state.ball.x - object.x,
        by = state.ball.y - object.y;
      let fraction = game.contactFraction(object, ax, ay, bx, by, radius);
      if (object.kind === "barrier" && object.angle !== previousAngle) {
        for (const angle of [
          previousAngle,
          (previousAngle + object.angle) / 2,
        ]) {
          const hit = game.contactFraction(
            object,
            ax,
            ay,
            bx,
            by,
            radius,
            angle,
          );
          if (hit !== null)
            fraction = fraction === null ? hit : Math.min(fraction, hit);
        }
      }
      if (fraction !== null) {
        contacts ??= [];
        contacts.push({ object, fraction });
      } else if (object.y > state.h + 60 && !object.magnetized)
        state.objects.splice(i, 1);
    }
    if (contacts) {
      contacts.sort((a, b) => a.fraction - b.fraction);
      for (const { object } of contacts) {
        const index = state.objects.indexOf(object);
        if (index < 0) continue;
        state.objects.splice(index, 1);
        game.resolveContact(object);
        if (state.mode !== "play") break;
      }
    }
    for (let i = state.sparks.length - 1; i >= 0; i--) {
      let p = state.sparks[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) state.sparks.splice(i, 1);
    }
    game.setText("distance", Math.floor(state.distance).toLocaleString());
  };
};
