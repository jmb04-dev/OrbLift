"use strict";
// Install rendering behavior on a single game instance.
OrbLift.installRendering = function (game) {
  const state = game.state;
  const { c, g, rnd, clamp } = game;
  const { skins } = OrbLift.content;
  let magnetGlow = null;
  let magnetGlowRadius = 0;
  let magnetGlowDpr = 0;
  let orbGlow = null,
    orbGlowDpr = 0;
  const coinSprites = new Map();
  function drawCoin(coin) {
    const gold = coin.value === 2,
      padding = coin.r + 36;
    const key = [gold, coin.r, state.dpr].join("|");
    let sprite = coinSprites.get(key);
    if (!sprite) {
      sprite = game.environment.document.createElement("canvas");
      sprite.width = sprite.height = Math.ceil(padding * 2 * state.dpr);
      const context = sprite.getContext("2d");
      context.setTransform(
        state.dpr,
        0,
        0,
        state.dpr,
        padding * state.dpr,
        padding * state.dpr,
      );
      context.shadowColor = gold ? "#de9e2c" : "#ffce42";
      context.shadowBlur = 18;
      context.fillStyle = gold ? "#b77816" : "#ffdb59";
      context.strokeStyle = gold ? "#ffd17a" : "#fff2a4";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, coin.r, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = gold ? "#70400b" : "#a46a00";
      context.beginPath();
      context.arc(0, 0, coin.r * (gold ? 0.75 : 0.57), 0, Math.PI * 2);
      context.stroke();
      if (coinSprites.size >= 8) {
        const oldest = coinSprites.keys().next().value;
        const old = coinSprites.get(oldest);
        old.width = old.height = 1;
        coinSprites.delete(oldest);
      }
      coinSprites.set(key, sprite);
    }
    g.drawImage(sprite, -padding, -padding, padding * 2, padding * 2);
    if (gold) {
      g.shadowBlur = 0;
      g.fillStyle = "#fff0b0";
      g.font = "900 13px system-ui";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("2", 0, 0);
    }
  }
  game.disposeRendering = () => {
    for (const sprite of coinSprites.values()) sprite.width = sprite.height = 1;
    coinSprites.clear();
    if (magnetGlow) magnetGlow.width = magnetGlow.height = 1;
    if (orbGlow) orbGlow.width = orbGlow.height = 1;
    magnetGlow = orbGlow = null;
  };
  game.drawMagnetField = function drawMagnetField() {
    if (state.magnet <= 0) return;
    const phase = state.time * 3;
    const pulse = 1 + Math.sin(phase * 2) * 0.06;
    const fieldRadius = Math.min(210, Math.min(state.w, state.h) * 0.55);
    g.save();
    g.translate(state.ball.x, state.ball.y);
    g.globalCompositeOperation = "lighter";
    // Reuse the glow until the viewport changes; fixed-size procedural effects
    // avoid per-frame particle allocation and keep work bounded on mobile.
    if (
      !magnetGlow ||
      magnetGlowRadius !== fieldRadius ||
      magnetGlowDpr !== state.dpr
    ) {
      magnetGlow = game.environment.document.createElement("canvas");
      magnetGlow.width = magnetGlow.height = Math.ceil(
        fieldRadius * 2 * state.dpr,
      );
      const glowContext = magnetGlow.getContext("2d");
      glowContext.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      const gradient = glowContext.createRadialGradient(
        fieldRadius,
        fieldRadius,
        12,
        fieldRadius,
        fieldRadius,
        fieldRadius,
      );
      gradient.addColorStop(0, "#55cfff66");
      gradient.addColorStop(0.5, "#008dff33");
      gradient.addColorStop(0.85, "#197bff18");
      gradient.addColorStop(1, "#148bff00");
      glowContext.fillStyle = gradient;
      glowContext.fillRect(0, 0, fieldRadius * 2, fieldRadius * 2);
      magnetGlowRadius = fieldRadius;
      magnetGlowDpr = state.dpr;
    }
    g.globalAlpha = 0.8 + Math.sin(phase * 2) * 0.15;
    g.drawImage(
      magnetGlow,
      -fieldRadius,
      -fieldRadius,
      fieldRadius * 2,
      fieldRadius * 2,
    );
    g.globalAlpha = 1;
    g.shadowColor = "#35baff";
    g.shadowBlur = 14;
    g.lineWidth = 1.4;
    for (let ring = 0; ring < 2; ring++) {
      g.strokeStyle = ring ? "#48bcff55" : "#80ddff99";
      g.beginPath();
      g.arc(
        0,
        0,
        fieldRadius * (0.48 + ring * 0.35) * pulse,
        phase * (ring ? -1 : 1),
        phase * (ring ? -1 : 1) + Math.PI * 1.85,
      );
      g.stroke();
    }
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI) / 4 + phase * 0.22;
      const radius =
        fieldRadius * (0.72 + Math.sin(phase + index) * 0.12) * pulse;
      const x = Math.cos(angle) * radius,
        y = Math.sin(angle) * radius;
      g.strokeStyle = "#43baff66";
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(
        x * 0.6 - y * 0.35,
        y * 0.6 + x * 0.35,
        x * 0.25,
        y * 0.25,
      );
      g.stroke();
    }
    // Jagged lightning filaments flicker along the outer field, safely behind
    // the orb; only six bolts of eight segments are generated per frame.
    g.lineWidth = 1.7;
    for (let bolt = 0; bolt < 6; bolt++) {
      const baseAngle = (bolt * Math.PI) / 3 + phase * 0.18;
      g.strokeStyle = bolt % 2 ? "#8fefffdd" : "#249fffbb";
      g.beginPath();
      for (let node = 0; node <= 8; node++) {
        const angle = baseAngle + node * 0.09;
        const jag = Math.sin(node * 7.3 + bolt * 3.1 + phase * 5) * 0.065;
        const radius = fieldRadius * (0.82 + jag) * pulse;
        const x = Math.cos(angle) * radius,
          y = Math.sin(angle) * radius;
        if (node === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    const wave = (state.time * 0.85) % 1;
    g.strokeStyle = "#64dfff";
    g.globalAlpha = (1 - wave) * 0.55;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, fieldRadius * (0.2 + wave * 0.75), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = "#b1eeff";
    for (let index = 0; index < 18; index++) {
      const angle = index * 2.39996 + phase * 0.7;
      const travel = (((index * 0.173 - state.time * 0.35) % 1) + 1) % 1;
      const radius = 25 + travel * (fieldRadius - 30);
      g.globalAlpha = 0.3 + (1 - travel) * 0.6;
      g.beginPath();
      g.arc(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        1 + (index % 3) * 0.4,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    g.restore();
  };
  game.resize = function resize() {
    const oldWidth = state.w,
      oldHeight = state.h;
    const changed =
      oldWidth > 0 &&
      (oldWidth !== game.environment.innerWidth ||
        oldHeight !== game.environment.innerHeight);
    if (changed && ["play", "launch", "countdown"].includes(state.mode))
      game.toggle();
    state.w = game.environment.innerWidth;
    state.h = game.environment.innerHeight;
    state.dpr = Math.min(game.environment.devicePixelRatio || 1, 2);
    c.width = state.w * state.dpr;
    c.height = state.h * state.dpr;
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.ball.y = state.h * 0.77;
    state.ball.x = state.ball.x
      ? clamp(state.ball.x, 24, state.w - 24)
      : state.w / 2;
    state.ball.target = state.ball.x;
    if (changed && state.objects.length) {
      const objects = state.objects;
      state.objects = [];
      // Rotation is a layout change, not a lethal teleport. Revalidate scaled
      // objects against the new viewport, retaining only reachable placements.
      objects.sort((a, b) => b.y - a.y);
      for (const object of objects) {
        const placed = {
          ...object,
          x: (game.spawnCenterX(object) * state.w) / oldWidth,
          y: (object.y * state.h) / oldHeight,
        };
        delete placed.anchorX;
        if (placed.trail) placed.trail = [];
        if (placed.magnetVx !== undefined)
          placed.magnetVx *= state.w / oldWidth;
        game.spawnGroup([placed]);
      }
    }
  };
  game.burst = function burst(x, y, color) {
    for (let i = 0; i < 15; i++) {
      const a = rnd(0, Math.PI * 2),
        s = rnd(50, 190);
      state.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rnd(0.2, 0.6),
        color,
      });
    }
  };
  game.draw = function draw(dt) {
    // Discard the previous paint history explicitly. An opaque background fill
    // alone can retain native recording surfaces in standalone Canvas hosts.
    g.clearRect(0, 0, state.w, state.h);
    game.drawBackground(dt);
    game.drawCosmicZones();
    const obstacleColor = game.zoneObstacleColor();
    for (const o of state.objects) {
      const radius =
        (o.maxR ?? o.r) * (o.kind === "barrier" ? Math.SQRT2 : 1) + 36;
      const trailVisible = o.trail?.some(
        (point) =>
          point.x >= -36 &&
          point.x <= state.w + 36 &&
          point.y >= -36 &&
          point.y <= state.h + 36,
      );
      if (
        !trailVisible &&
        (o.x + radius < 0 ||
          o.x - radius > state.w ||
          o.y + radius < 0 ||
          o.y - radius > state.h)
      )
        continue;
      g.save();
      if (
        state.magnet > 0 &&
        o.kind === "coin" &&
        o.magnetized &&
        o.trail?.length > 1
      ) {
        g.strokeStyle = "#80dfff88";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(o.trail[0].x, o.trail[0].y);
        for (let index = 1; index < o.trail.length; index++)
          g.lineTo(o.trail[index].x, o.trail[index].y);
        g.lineTo(o.x, o.y);
        g.stroke();
      }
      g.translate(o.x, o.y);
      // Coin art is rotationally symmetric; keep its sprite and value text
      // upright instead of re-filtering the same bitmap at a new angle.
      if (o.kind !== "coin") g.rotate(o.angle);
      if (o.kind === "barrier") {
        g.shadowColor = obstacleColor;
        g.shadowBlur = 18;
        g.fillStyle = "#430718";
        g.strokeStyle = obstacleColor;
        g.lineWidth = 3;
        g.fillRect(-o.r, -o.r, o.r * 2, o.r * 2);
        g.strokeRect(-o.r, -o.r, o.r * 2, o.r * 2);
        if (o.variant === "moving") {
          g.beginPath();
          g.moveTo(-o.r * 0.6, 0);
          g.lineTo(o.r * 0.6, 0);
          g.moveTo(-o.r * 0.3, -4);
          g.lineTo(-o.r * 0.6, 0);
          g.lineTo(-o.r * 0.3, 4);
          g.moveTo(o.r * 0.3, -4);
          g.lineTo(o.r * 0.6, 0);
          g.lineTo(o.r * 0.3, 4);
          g.stroke();
        } else if (o.variant === "pulsing") {
          g.globalAlpha = 0.28;
          g.lineWidth = 1;
          g.strokeRect(-o.maxR, -o.maxR, o.maxR * 2, o.maxR * 2);
        }
      } else if (o.kind === "coin") {
        drawCoin(o);
      } else if (o.kind === "multiplier") {
        g.shadowColor = "#c178ff";
        g.shadowBlur = 24;
        g.fillStyle = "#9b43f5";
        g.beginPath();
        g.arc(0, 0, o.r + 3, 0, 7);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#fff";
        g.font = "bold " + Math.round(o.r * 0.95) + "px system-ui";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("2×", 0, 0);
      } else if (o.kind === "magnet") {
        g.shadowColor = "#269fff";
        g.shadowBlur = 25;
        g.fillStyle = "#06326c";
        g.strokeStyle = "#48bcff";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, o.r + 3, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.scale(o.r / 15, o.r / 15);
        g.lineWidth = 4;
        g.lineCap = "round";
        g.strokeStyle = "#8ee6ff";
        g.beginPath();
        g.moveTo(-8, -10);
        g.lineTo(-8, 0);
        g.arc(0, 0, 8, Math.PI, 0, true);
        g.lineTo(8, -10);
        g.stroke();
        g.strokeStyle = "#fff";
        g.beginPath();
        g.moveTo(-8, -10);
        g.lineTo(-8, -7);
        g.moveTo(8, -10);
        g.lineTo(8, -7);
        g.stroke();
      } else {
        g.shadowColor = "#5defff";
        g.shadowBlur = 20;
        g.strokeStyle = "#6befff";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, o.r, 0, 7);
        g.stroke();
      }
      g.restore();
    }
    for (const p of state.sparks) {
      g.globalAlpha = Math.min(1, p.life * 2);
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, 4, 4);
    }
    g.globalAlpha = 1;
    if (["play", "paused", "countdown"].includes(state.mode)) {
      game.drawMagnetField();
      if (!orbGlow || orbGlowDpr !== state.dpr) {
        orbGlow = game.environment.document.createElement("canvas");
        orbGlow.width = orbGlow.height = 170 * state.dpr;
        const context = orbGlow.getContext("2d");
        context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        const glow = context.createRadialGradient(85, 85, 1, 85, 85, 85);
        glow.addColorStop(0, "#ff2e9c65");
        glow.addColorStop(1, "#ff2e9c00");
        context.fillStyle = glow;
        context.fillRect(0, 0, 170, 170);
        orbGlowDpr = state.dpr;
      }
      g.drawImage(orbGlow, state.ball.x - 85, state.ball.y - 85, 170, 170);
      const skinColor = skins.find((s) => s.id === state.skin).color;
      g.shadowColor = skinColor;
      g.shadowBlur = 34;
      g.fillStyle = skinColor;
      g.beginPath();
      g.arc(state.ball.x, state.ball.y, state.ball.r, 0, 7);
      g.fill();
      g.shadowBlur = 12;
      g.fillStyle = "#ffd4eb";
      g.beginPath();
      g.arc(state.ball.x - 4, state.ball.y - 4, 4, 0, 7);
      g.fill();
      g.shadowBlur = 0;
      if (state.shield > 0 || state.invincible > 0) {
        g.strokeStyle = "#67eaff";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(state.ball.x, state.ball.y, state.ball.r + 11, 0, 7);
        g.stroke();
      }
    }
  };
  game.drawLaunch = function drawLaunch(dt) {
    if (state.mode !== "launch") return;
    state.launchElapsed += dt;
    const t = state.launchElapsed,
      progress = Math.min(1, t / 0.95),
      cx = state.w / 2,
      cy = state.h * 0.77;
    g.save();
    g.globalCompositeOperation = "lighter";
    const flash = Math.max(0, 1 - t / 0.22);
    if (flash) {
      g.fillStyle = "rgba(255,185,240," + flash * 0.42 + ")";
      g.fillRect(0, 0, state.w, state.h);
    }
    const shock = 25 + progress * Math.max(state.w, state.h) * 0.72;
    g.strokeStyle = "rgba(255,120,225," + (1 - progress) * 0.85 + ")";
    g.lineWidth = 9 * (1 - progress) + 1;
    g.shadowColor = "#ff50cb";
    g.shadowBlur = 28;
    g.beginPath();
    g.arc(cx, cy, shock, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    for (const p of state.launchParticles) {
      const dist = t * p.v * (0.6 + 0.4 * progress),
        x = cx + Math.cos(p.a) * dist,
        y = cy + Math.sin(p.a) * dist;
      const alpha = Math.max(0, 1 - progress * progress);
      g.strokeStyle =
        [
          "rgba(255,95,198,",
          "rgba(166,106,255,",
          "rgba(107,228,255,",
          "rgba(255,237,190,",
        ][p.hue] +
        alpha +
        ")";
      g.lineWidth = p.r * (1 - progress * 0.65);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(
        x - Math.cos(p.a) * (8 + progress * 23),
        y - Math.sin(p.a) * (8 + progress * 23),
      );
      g.stroke();
    }
    const core = Math.max(0, 1 - t / 0.7);
    if (core) {
      const rad = 12 + core * 60,
        grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, "rgba(255,255,255," + core + ")");
      grad.addColorStop(0.23, "rgba(255,88,211," + core * 0.8 + ")");
      grad.addColorStop(1, "rgba(255,0,155,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, rad, 0, 7);
      g.fill();
    }
    g.restore();
    if (t >= 0.95) {
      state.mode = "play";
      state.launchParticles = [];
    }
  };
};
