const fs = require("node:fs");
const path = require("node:path");
const { walk } = require("./paths.cjs");

/** README / public / 禁止 CLI / server.ts 装配层 / routes / lib / 文件头「职责」/ /health。 */
function checkStructure(ctx) {
  const { root, publicDir, fail, ok } = ctx;

  fs.existsSync(path.join(root, "README.md")) ? ok("README.md") : fail("缺 README.md");

  if (!fs.existsSync(publicDir)) {
    fail("缺 public/（禁止纯 CLI 小节 Demo）");
    return false;
  }

  if (fs.existsSync(path.join(root, "index.ts")))
    fail("残留小节 CLI 入口 index.ts（禁止）");
  if (fs.existsSync(path.join(root, "src/index.ts")))
    fail("残留 CLI src/index.ts（禁止）");
  if (fs.existsSync(path.join(root, "src/index-anthropic.ts")))
    fail("残留 CLI src/index-anthropic.ts（禁止）");

  const serverPath = path.join(root, "server.ts");
  if (!fs.existsSync(serverPath)) {
    fail("缺 server.ts");
  } else {
    const src = fs.readFileSync(serverPath, "utf8");
    const lines = src.split("\n").length;
    if (lines > 120) fail(`server.ts ${lines} 行，超出装配层（应 <=120）`);
    else ok(`server.ts ${lines} 行（装配层）`);
    if (/router\.(get|post)\s*\(/.test(src))
      fail("server.ts 里直接写了 router.get/post —— 业务应在 routes/");
    if (!src.includes("fileURLToPath")) fail("server.ts 未用绝对路径 serve(publicDir)");
    if (!src.includes("职责")) fail("server.ts 文件头缺「职责」注释");
  }

  const routesDir = path.join(root, "routes");
  const libDir = path.join(root, "lib");
  const routeFiles = walk(routesDir).filter((f) => f.endsWith(".ts"));
  routeFiles.length > 0 ? ok(`routes/ ${routeFiles.length} 个文件`) : fail("缺 routes/*.ts");
  const hasHealthFile = routeFiles.some((f) => path.basename(f) === "health.ts");
  hasHealthFile ? ok("routes/health.ts") : fail("缺 routes/health.ts（§5.3.5）");

  if (fs.existsSync(libDir)) {
    const subdirs = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    subdirs.length > 0
      ? ok("lib/ 子目录：" + subdirs.join(" · "))
      : fail("lib/ 是平铺文件，未按职责分子目录（§5.3.8）");
    for (const bad of ["helpers.ts", "utils.ts", "common.ts", "misc.ts", "temp.ts"]) {
      if (fs.existsSync(path.join(libDir, bad))) fail("含糊文件名 lib/" + bad);
    }
  } else {
    fail("缺 lib/");
  }

  const runtimePath = path.join(root, "lib/http/runtime-ctx.ts");
  fs.existsSync(runtimePath)
    ? ok("lib/http/runtime-ctx.ts")
    : fail("缺 lib/http/runtime-ctx.ts");

  for (const f of walk(root).filter((f) => f.endsWith(".ts"))) {
    const head = fs.readFileSync(f, "utf8").slice(0, 500);
    if (!head.includes("职责")) fail(path.relative(root, f) + " 文件头缺「职责」注释");
  }

  const allTs = walk(root)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  /["'`]\/health["'`]/.test(allTs) ? ok("GET /health") : fail("缺 GET /health（§5.3.9）");
  if (!/hasKey/.test(allTs)) fail("/health 未返回 hasKey（§5.3.9）");
  if (!/provider/.test(allTs)) fail("/health 未返回 provider（§5.3.9）");

  return true;
}

module.exports = { checkStructure };
