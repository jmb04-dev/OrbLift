"use strict";

// Small, baked domain-warped cloud textures: detailed scenery without noise,
// blur filters, image downloads or hundreds of gradients in the frame loop.
OrbLift.installEnvironmentArt = function installEnvironmentArt(game) {
  const { imul, floor, pow, max, min, round, sin, cos } = Math;
  const palettes = {
    void: ["17123b", "6942a8", "1685ae", "ee7ebc"],
    stars: ["101c4a", "247fae", "8275e8", "f1acdc"],
    grid: ["160a42", "783be0", "16b7ce", "ec68bd"],
    embers: ["320d24", "d44826", "f2a148", "ab285e"],
    ocean: ["062b49", "087caa", "46dfb8", "4365df"],
    aurora: ["092b3e", "25b893", "6356c5", "d086df"],
    nebula: ["240d4b", "a738cb", "367fd8", "f477b9"],
    matrix: ["072c31", "169463", "6ec79c", "2471ad"],
    galaxy: ["17123f", "7965d8", "e07db2", "a5c8f7"],
    eclipse: ["271438", "bf4c5c", "eda76a", "6347b5"],
    warp: ["081b47", "2c6ed5", "49d6e6", "a466e9"],
    cosmic: ["291448", "b46dc9", "e9b065", "76bce2"],
  };
  const cache = new Map();
  game.disposeEnvironmentArt = () => {
    for (const art of cache.values())
      for (const layer of art.layers) layer.width = layer.height = 1;
    cache.clear();
  };
  const width = 192,
    height = 288;
  function hash(x, y, seed) {
    let value = imul(x, 374761393) ^ imul(y, 668265263) ^ seed;
    value = imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y, seed) {
    const ix = floor(x),
      iy = floor(y);
    let fx = x - ix,
      fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const gx = (ix + seed) & 127,
      gy = (iy + (seed >>> 7)) & 127;
    const nextX = (gx + 1) & 127,
      nextY = (gy + 1) & 127;
    const a = lattice[gy * 128 + gx],
      b = lattice[gy * 128 + nextX];
    const c = lattice[nextY * 128 + gx],
      d = lattice[nextY * 128 + nextX];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  const lattice = new Float32Array(128 * 128);
  for (let index = 0; index < lattice.length; index++)
    lattice[index] = hash(index & 127, index >>> 7, 7319);
  function fractal(x, y, seed) {
    return (
      noise(x, y, seed) * 0.55 +
      noise(x * 2.1, y * 2.1, seed + 13) * 0.27 +
      noise(x * 4.3, y * 4.3, seed + 31) * 0.13 +
      noise(x * 8.7, y * 8.7, seed + 71) * 0.05
    );
  }
  function bake(id) {
    const index = Object.keys(palettes).indexOf(id),
      seed = 9137 + index * 7919;
    const colors = palettes[id].map((color) =>
      [0, 2, 4].map((offset) => parseInt(color.slice(offset, offset + 2), 16)),
    );
    const layers = [];
    for (let layer = 0; layer < 2; layer++) {
      const canvas = game.environment.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      const pixels = context.createImageData(width, height);
      if (pixels?.data) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const u = (x / width) * (3 + (index % 3) * 0.55),
              v = (y / height) * (4 + (index % 4) * 0.6);
            const warp = noise(u * 0.7, v * 0.7, seed + layer * 101) * 2.8;
            const cloud = fractal(u + warp, v - warp * 0.7, seed + layer * 317);
            const ridge = pow(max(0, 1 - Math.abs(cloud - 0.56) * 3.4), 2);
            const dust = noise(u * 1.7 + warp, v * 1.7, seed + 97);
            const blend = max(
              0,
              min(2.999, (cloud * 2 + noise(u, v, seed + 55)) * 1.3),
            );
            const colorIndex = floor(blend),
              mix = blend - colorIndex;
            const exposure = 0.18 + ridge * 0.74 + cloud * 0.22;
            const offset = (y * width + x) * 4;
            for (let channel = 0; channel < 3; channel++) {
              const color =
                colors[colorIndex][channel] * (1 - mix) +
                colors[colorIndex + 1][channel] * mix;
              data[offset + channel] = color * exposure * (0.52 + dust * 0.48);
            }
            data[offset + 3] = layer ? round(ridge * 180) : 255;
          }
        pixels.data.set(data);
        context.putImageData(pixels, 0, 0);
      } else {
        // Minimal/non-raster hosts retain a colorful gradient fallback.
        const gradient = context.createLinearGradient(0, 0, width, height);
        palettes[id].forEach((color, position) =>
          gradient.addColorStop(position / 3, "#" + color),
        );
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }
      layers.push(canvas);
    }
    if (cache.size >= 2) cache.delete(cache.keys().next().value);
    const art = { layers, index, seed };
    cache.set(id, art);
    return art;
  }
  game.drawEnvironmentArt = function drawEnvironmentArt(id, time, w, h) {
    const art = cache.get(id) || bake(id),
      g = game.g;
    g.save();
    g.imageSmoothingEnabled = true;
    for (let layer = 0; layer < 2; layer++) {
      const phase = time * (0.024 + layer * 0.019) + art.index;
      const driftX = sin(phase) * w * 0.045;
      const driftY = cos(phase * 0.8) * h * 0.045;
      g.globalAlpha = layer ? 0.32 + sin(time * 0.17 + art.index) * 0.08 : 1;
      g.globalCompositeOperation = layer ? "screen" : "source-over";
      g.drawImage(
        art.layers[layer],
        -w * 0.1 + driftX,
        -h * 0.1 + driftY,
        w * 1.2,
        h * 1.2,
      );
    }
    g.globalCompositeOperation = "screen";
    for (let star = 0; star < 56; star++) {
      const depth = 0.3 + (star % 5) * 0.17;
      const x =
        (((hash(star, 0, art.seed) * w + sin(time * 0.025) * depth * 12) % w) +
          w) %
        w;
      const y = (hash(star, 1, art.seed) * h + time * depth * 4) % h;
      g.globalAlpha =
        (0.25 + depth * 0.35) * (0.75 + sin(time * depth + star) * 0.25);
      g.fillStyle = "#" + palettes[id][1 + (star % 3)];
      const size = 0.6 + depth;
      g.fillRect(x, y, size, size);
    }
    g.restore();
  };
};
