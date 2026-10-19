// Generate a self-contained browser QA page with isolated in-memory saves.
// No production hooks, user's localStorage changes, network or dependencies.
const fs = require("node:fs"),
  path = require("node:path");
const runtime = fs.readFileSync("tools/browser-audit-runtime.js", "utf8");
let html = fs
  .readFileSync("index.html", "utf8")
  .replace("<head>", '<head><base href="../">')
  .replace(
    '<link rel="stylesheet" href="styles/game.css" />',
    () => "<style>" + fs.readFileSync("styles/game.css", "utf8") + "</style>",
  );
html = html.replace(/<script src="([^"]+)">\s*<\/script>/g, (_, file) => {
  let source = fs.readFileSync(file, "utf8");
  if (file === "game.js")
    source = source.replace(
      "OrbLift.createGame(globalThis);",
      "globalThis.qaGame=OrbLift.createGame(globalThis);",
    );
  return "<script>" + source.replace(/<\/script/gi, "<\\/script") + "</script>";
});
const badges = Object.fromEntries(
  fs
    .readdirSync("badges")
    .map((file) => [
      "badges/" + file,
      "data:image/png;base64," +
        fs.readFileSync("badges/" + file).toString("base64"),
    ]),
);
const isolated = `<script>const qaSaved={neonRushBank:"1000000"};const qaBadges=${JSON.stringify(badges)};Object.defineProperty(window,"localStorage",{value:{getItem:k=>qaSaved[k]??null,setItem:(k,v)=>qaSaved[k]=String(v)}});</script>`;
html = html.replace("<script>", isolated + "<script>");
html = html.replace("</body>", "<script>" + runtime + "</script></body>");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const page = `<!doctype html><html><head><meta charset="utf-8"><title>OrbLift isolated QA</title><style>body{font:15px system-ui;background:#101122;color:#eee}button{padding:12px}pre{white-space:pre-wrap}iframe{width:390px;height:844px;border:0}</style></head><body><h1>OrbLift isolated QA</h1><button autofocus id="audit">Run browser audit</button><pre id="report">Ready. Test saves are isolated from your game.</pre><iframe title="OrbLift test viewport" sandbox="allow-scripts" srcdoc="${escape(html)}"></iframe><script>const frame=document.querySelector('iframe');document.querySelector('button').onclick=()=>{document.querySelector('pre').textContent='Audit running…';frame.contentWindow.postMessage('run-audit','*');};addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.type==='orblift-audit')document.querySelector('pre').textContent=JSON.stringify(event.data.report,null,2);});</script></body></html>`;
fs.writeFileSync("artifacts/browser-audit.html", page);
console.log(path.resolve("artifacts/browser-audit.html"));
