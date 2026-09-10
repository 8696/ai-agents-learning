const fs = require("node:fs");
const path = require("node:path");
const { APPS, walk, listDemos } = require("./paths.cjs");

function parseReadmePorts(readme) {
  const map = {};
  for (const m of readme.matchAll(/`yarn (app:[^`]+)`\s*\|\s*`(\d{5}|—)`/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

function checkDemoPorts(ctx) {
  const { root, relRoot, publicDir, fail, ok } = ctx;
  const runtimePath = path.join(root, "lib/http/runtime-ctx.ts");
  const runtimeSrc = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : "";
  const portMatch = runtimeSrc.match(/\.default\((\d{5})\)/);
  const port = portMatch ? portMatch[1] : null;
  const demoReadme = fs.existsSync(path.join(root, "README.md"))
    ? fs.readFileSync(path.join(root, "README.md"), "utf8")
    : "";
  if (port && !demoReadme.includes(port)) fail(`本条 README 未写默认端口 ${port}`);

  const pkg = JSON.parse(fs.readFileSync(path.join(APPS, "package.json"), "utf8"));
  const posixRoot = relRoot.split(path.sep).join("/");
  const script = Object.entries(pkg.scripts || {}).find(([, cmd]) =>
    String(cmd).includes(posixRoot + "/server.ts"),
  );
  if (!script) fail("apps/package.json 没有指向本条 server.ts 的 yarn 脚本");
  else {
    const appsReadme = fs.readFileSync(path.join(APPS, "README.md"), "utf8");
    const table = parseReadmePorts(appsReadme);
    const scriptName = script[0];
    if (!table[scriptName]) fail(`apps/README 占用表没有 ${scriptName}`);
    else if (port && table[scriptName] !== port)
      fail(`端口三处不一致：runtime=${port} apps/README=${table[scriptName]}`);
    else if (port) ok(`端口 ${port} 三处一致（${scriptName}）`);
  }

  const htmlFiles = walk(publicDir).filter((f) => f.endsWith(".html"));
  const front = [
    ...walk(path.join(publicDir, "components")).filter((f) => f.endsWith(".js")),
    ...htmlFiles,
  ];
  for (const f of front) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/env\.port \|\| (\d{5})/g)) {
      if (port && m[1] !== port)
        fail(`${path.relative(root, f)} 页脚 fallback 端口 ${m[1]} ≠ 本条 ${port}`);
    }
  }
}

function checkPortUniqueness() {
  let failed = 0;
  const seen = new Map();
  for (const demo of listDemos()) {
    const runtime = path.join(demo, "lib/http/runtime-ctx.ts");
    if (!fs.existsSync(runtime)) continue;
    const m = fs.readFileSync(runtime, "utf8").match(/\.default\((\d{5})\)/);
    if (!m) continue;
    if (seen.has(m[1])) {
      failed++;
      console.log(
        "FAIL 端口重复 " + m[1] + "：" + path.relative(APPS, seen.get(m[1])) + " 与 " + path.relative(APPS, demo),
      );
    } else seen.set(m[1], demo);
  }
  if (failed === 0) console.log("OK   默认端口全仓库不重复（" + seen.size + " 个）");
  return failed;
}

function checkNoCliScripts() {
  let failed = 0;
  const pkg = JSON.parse(fs.readFileSync(path.join(APPS, "package.json"), "utf8"));
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    if (!String(name).startsWith("app:")) continue;
    if (/(?:^|[\s/])index(?:-anthropic)?\.ts\b/.test(String(cmd))) {
      failed++;
      console.log("FAIL " + name + " 是 CLI 入口（禁止；一律 tsx …/server.ts）");
    }
  }
  if (failed === 0) console.log("OK   yarn app:* 没有 CLI 入口");
  return failed;
}

module.exports = { checkDemoPorts, checkPortUniqueness, checkNoCliScripts };
