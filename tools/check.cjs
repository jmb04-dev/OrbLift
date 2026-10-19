const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const sources = [
  "game.js",
  ...fs.readdirSync(path.join(root, "js")).map((file) => "js/" + file),
  ...fs
    .readdirSync(path.join(root, "tools"))
    .filter((file) => /\.(c?js)$/.test(file))
    .map((file) => "tools/" + file),
  "tests/helpers/host.cjs",
];
for (const file of sources) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const result = spawnSync(process.execPath, ["--test", "tests/game.test.cjs"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status || (result.error ? 1 : 0));
