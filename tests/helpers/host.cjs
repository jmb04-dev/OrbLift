const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const scripts = [
  ...fs
    .readFileSync("index.html", "utf8")
    .matchAll(/<script src="([^"]+)">\s*<\/script>/g),
].map((match) => match[1]);
const markupIds = new Set(
  [...fs.readFileSync("index.html", "utf8").matchAll(/\bid="([^"]+)"/g)].map(
    (match) => match[1],
  ),
);
function boot(saved = {}, broken = false, rawPointer = false, options = {}) {
  const metrics = {
    lookups: 0,
    textWrites: 0,
    styleWrites: 0,
    attributeWrites: 0,
    storageWrites: 0,
    canvases: 0,
  };
  const elements = new Map(),
    events = {};
  const context = new Proxy(
    {
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    },
    { get: (o, k) => o[k] || (() => {}) },
  );
  function element() {
    let html = "",
      text = "";
    const classes = new Set();
    return {
      style: new Proxy(
        {},
        {
          set(object, key, value) {
            metrics.styleWrites++;
            object[key] = value;
            return true;
          },
        },
      ),
      get textContent() {
        return text;
      },
      set textContent(value) {
        metrics.textWrites++;
        text = value;
      },
      get innerHTML() {
        return html;
      },
      set innerHTML(value) {
        html = value;
        this.children = [];
      },
      children: [],
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
      },
      addEventListener: (key, fn) => (events[key] = fn),
      removeEventListener: (key) => delete events[key],
      setPointerCapture() {},
      attributes: {},
      setAttribute(name, value) {
        metrics.attributeWrites++;
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      focus() {},
      appendChild(b) {
        this.children.push(b);
      },
      getContext: () => context,
    };
  }
  const document = {
    hidden: false,
    querySelector: () => {
      const mock = element();
      const canvas = options.canvas || mock;
      if (options.canvas)
        for (const key of [
          "style",
          "addEventListener",
          "removeEventListener",
          "setPointerCapture",
        ])
          canvas[key] = mock[key];
      if (rawPointer) canvas.onpointerrawupdate = null;
      return canvas;
    },
    getElementById: (id) => {
      metrics.lookups++;
      assert.ok(markupIds.has(id), "Missing element in actual HTML: " + id);
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: (tag) => {
      if (tag === "canvas") {
        metrics.canvases++;
        if (options.createCanvas) return options.createCanvas();
      }
      return element();
    },
    addEventListener: (key, fn) => (events[key] = fn),
    removeEventListener: (key) => delete events[key],
  };
  const storage = {
    getItem: (key) => saved[key] ?? null,
    setItem: (key, value) => {
      metrics.storageWrites++;
      if (broken) throw Error("quota");
      saved[key] = String(value);
    },
    removeItem: (key) => delete saved[key],
  };
  let frame;
  const sandbox = {
    document,
    window: { localStorage: storage },
    innerWidth: options.width || 320,
    innerHeight: options.height || 568,
    devicePixelRatio: options.dpr || 2,
    addEventListener: (key, fn) => (events[key] = fn),
    removeEventListener: (key) => delete events[key],
    requestAnimationFrame(fn) {
      frame = fn;
      return 1;
    },
    cancelAnimationFrame() {
      frame = null;
    },
  };
  vm.createContext(sandbox);
  for (const file of scripts.filter((file) => file !== "game.js")) {
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  vm.runInContext("globalThis.game=OrbLift.createGame(globalThis);", sandbox);
  sandbox.game.set = (values) => Object.assign(sandbox.game.state, values);
  sandbox.game.collect = (kind) => {
    const { ball } = sandbox.game.state;
    sandbox.game.state.objects = [
      { kind, x: ball.x, y: ball.y, r: 13, angle: 0, spin: 0 },
    ];
    sandbox.game.update(0);
  };
  return {
    metrics,
    game: sandbox.game,
    e: (id) => document.getElementById(id),
    saved,
    events,
    document,
    tick: (timestamp) => frame?.(timestamp),
    sandbox,
  };
}
module.exports = { boot, scripts };
