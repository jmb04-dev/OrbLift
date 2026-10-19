// Optional visual QA helper: pass an installed @napi-rs/canvas module path.
// The game itself requires no dependencies or build process.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createCanvas } = require(process.argv[2] || "@napi-rs/canvas");
const root = path.resolve(__dirname, "..");
const canvas = createCanvas(390, 844);
const game = {
  g: canvas.getContext("2d"),
  state: {
    w: 390,
    h: 844,
    dpr: 1,
    backgroundTime: 12,
    mode: "paused",
    background: "void",
  },
  environment: {
    document: { hidden: false, createElement: () => createCanvas(192, 192) },
  },
};
const context = vm.createContext({ game });
for (const file of ["storage", "content", "environment-art", "formations", "backgrounds"]) {
  vm.runInContext(
    fs.readFileSync(path.join(root, "js", file + ".js"), "utf8"),
    context,
  );
}
vm.runInContext(
  "OrbLift.installBackgrounds(game); globalThis.catalog=OrbLift.content.backgrounds;",
  context,
);
const sheet = createCanvas(816, 1398),
  g = sheet.getContext("2d");
g.fillStyle = "#080a15";
g.fillRect(0, 0, sheet.width, sheet.height);
const fingerprints = new Set();
const timings = [];
context.catalog.forEach((theme, index) => {
  game.state.background = theme.id;
  const coldStart = performance.now();
  game.drawBackground(0);
  const coldMs = performance.now() - coldStart;
  const pixels = game.g.getImageData(0, 0, 390, 844).data;
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const colors = new Set();
    let saturation = 0;
    for (let sample = 0; sample < 24; sample++) {
      const x = 12 + (quadrant % 2) * 195 + ((sample * 37) % 170);
      const y = 12 + Math.floor(quadrant / 2) * 422 + ((sample * 71) % 390);
      const offset = (y * 390 + x) * 4;
      const rgb = [...pixels.slice(offset, offset + 3)];
      colors.add(rgb.join(","));
      saturation += Math.max(...rgb) - Math.min(...rgb);
    }
    assert.ok(
      colors.size > 16 && saturation / 24 > 8,
      theme.id + " must fill each quadrant with colored cloud detail",
    );
  }
  const fingerprint = createHash("sha256")
    .update(canvas.toBuffer("image/png"))
    .digest("hex");
  assert.ok(
    !fingerprints.has(fingerprint),
    "Every scene must have a unique raster output",
  );
  fingerprints.add(fingerprint);
  const x = 8 + (index % 4) * 204,
    y = 8 + Math.floor(index / 4) * 466;
  g.drawImage(canvas, x, y, 195, 422);
  g.fillStyle = "#e9e1ff";
  g.font = "bold 12px sans-serif";
  g.fillText(theme.name, x + 3, y + 442);
  game.state.backgroundTime += 0.5;
  game.drawBackground(0);
  assert.notEqual(
    createHash("sha256").update(canvas.toBuffer("image/png")).digest("hex"),
    fingerprint,
    theme.id + " must animate",
  );
  game.state.backgroundTime -= 0.5;
  const warmStart = performance.now();
  for (let frame = 0; frame < 12; frame++) {
    game.state.backgroundTime += 1 / 60;
    game.drawBackground(0);
  }
  timings.push({
    theme: theme.id,
    coldMs: +coldMs.toFixed(2),
    warmFrameMs: +((performance.now() - warmStart) / 12).toFixed(2),
  });
});
const output = path.join(root, "artifacts");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, "visual-performance.json"),
  JSON.stringify(timings, null, 2),
);
fs.writeFileSync(
  path.join(output, "backgrounds.png"),
  sheet.toBuffer("image/png"),
);
game.state.background = "aurora";
game.drawBackground(0);
fs.writeFileSync(path.join(output, "aurora.png"), canvas.toBuffer("image/png"));
for (const [w, h, dpr] of [
  [320, 568, 1],
  [844, 390, 2],
]) {
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  game.state.w = w;
  game.state.h = h;
  game.state.dpr = dpr;
  game.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const theme of context.catalog) {
    game.state.background = theme.id;
    game.drawBackground(0);
  }
}
console.log(path.join(output, "backgrounds.png"));
console.log(
  "Real Canvas checks passed: 12 unique animated scenes, plus 24 small-screen/landscape renders.",
);
// Render the actual pickup drawing paths together for size/value visual QA.
const actualBackground = game.drawBackground;
const elements = new Map();
game.$ = (id) => {
  if (!elements.has(id)) elements.set(id, { style: {}, setAttribute() {} });
  return elements.get(id);
};
game.rnd = (a, b) => (a + b) / 2;
game.setText = (id, value) => {
  game.$(id).textContent = String(value);
};
game.setStyle = (id, property, value) => {
  game.$(id).style[property] = value;
};
game.setAttribute = (id, name, value) => {
  game.$(id).setAttribute(name, String(value));
};
game.clamp = (value, low, high) => Math.max(low, Math.min(high, value));
vm.runInContext(
  fs.readFileSync(path.join(root, "js/zones.js"), "utf8"),
  context,
);
Object.assign(game.state, {
  distance: 0,
  time: 12,
  runCoins: 0,
  w: 390,
  h: 844,
  dpr: 1,
  mode: "play",
  background: "aurora",
});
canvas.width = 390;
canvas.height = 844;
vm.runInContext("OrbLift.installCosmicZones(game)", context);
const zonesSheet = createCanvas(390 * 10, 844);
const zoneFingerprints = new Set();
for (let index = 0; index < 10; index++) {
  game.state.distance = game.zoneStartAt(index);
  game.syncZoneMilestones();
  game.updateCosmicEvents(1.6);
  actualBackground(0);
  game.drawCosmicZones();
  const fingerprint = createHash("sha256")
    .update(canvas.toBuffer("image/png"))
    .digest("hex");
  assert.ok(
    !zoneFingerprints.has(fingerprint),
    "Each zone must produce a distinct overlay",
  );
  zoneFingerprints.add(fingerprint);
  zonesSheet.getContext("2d").drawImage(canvas, index * 390, 0);
  assert.equal(game.state.background, "aurora");
}
fs.writeFileSync(
  path.join(output, "zones.png"),
  zonesSheet.toBuffer("image/png"),
);
console.log(
  "Cosmic Zones: ten distinct actual Canvas overlays, including generated themes, rendered over equipped Aurora.",
);
canvas.width = 400;
canvas.height = 140;
game.g.setTransform(1, 0, 0, 1, 0, 0);
game.state.mode = "menu";
game.state.sparks = [];
vm.runInContext(
  fs.readFileSync(path.join(root, "js/rendering.js"), "utf8"),
  context,
);
vm.runInContext(
  "OrbLift.installRendering(game);globalThis.balance=OrbLift.balance;",
  context,
);
game.drawBackground = () => {
  game.g.fillStyle = "#080a15";
  game.g.fillRect(0, 0, 400, 140);
};
game.state.objects = [
  {
    kind: "coin",
    value: 1,
    r: context.balance.coinRadius,
    x: 55,
    y: 62,
    angle: 0.4,
  },
  {
    kind: "coin",
    value: 2,
    r: context.balance.coinRadius,
    x: 145,
    y: 62,
    angle: 0.4,
  },
  {
    kind: "multiplier",
    r: context.balance.multiplierRadius,
    x: 245,
    y: 62,
    angle: 0,
  },
  {
    kind: "magnet",
    r: context.balance.magnetPickupRadius,
    x: 345,
    y: 62,
    angle: 0,
  },
];
game.draw(0);
game.g.fillStyle = "#d9dcf2";
game.g.font = "bold 11px sans-serif";
game.g.textAlign = "center";
for (const [text, x] of [
  ["1 COIN", 55],
  ["2 COINS", 145],
  ["2× BOOST", 245],
  ["MAGNET", 345],
])
  game.g.fillText(text, x, 115);
fs.writeFileSync(
  path.join(output, "pickups.png"),
  canvas.toBuffer("image/png"),
);
