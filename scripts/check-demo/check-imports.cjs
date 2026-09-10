const fs = require("node:fs");
const path = require("node:path");
const { walk } = require("./paths.cjs");
const { stripJsComments } = require("./jsx.cjs");

function checkCrossImports(ctx) {
  const { root, fail } = ctx;
  for (const f of walk(root).filter((f) => /\.(ts|js)$/.test(f))) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(root, f);
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue;
      const abs = path.resolve(path.dirname(f), spec);
      const absPosix = abs.replace(/\\/g, "/");
      const inSelf = abs.startsWith(root);
      // §5.3.12：只允许 llm / load-root-env。§5.3.16：禁止运行时 import apps/logger
      if (/\/apps\/logger(\.ts|\.js)?$/.test(absPosix)) {
        fail(rel + " : 禁止 import 顶层 apps/logger（§5.3.16；须完整拷到本夹 lib/logger.ts）");
        continue;
      }
      const isSharedInfra = /\/apps\/(llm|load-root-env)(\.ts|\.js)?$/.test(absPosix);
      if (!inSelf && !isSharedInfra) fail(rel + " : 跨小节 import " + spec + "（§5.3.12 禁止）");
    }
  }
}

function checkLogger(ctx) {
  const { root, fail, ok } = ctx;
  // §5.3.16：本地完整 logger（锁定/未锁定一视同仁；禁止薄包装委托顶层）
  const localLoggerPath = path.join(root, "lib/logger.ts");
  if (!fs.existsSync(localLoggerPath)) {
    fail("缺 lib/logger.ts（§5.3.16：须完整拷贝顶层模板，禁止委托 apps/logger）");
  } else {
    const loggerSrc = fs.readFileSync(localLoggerPath, "utf8");
    const loggerNoComments = stripJsComments(loggerSrc);
    if (/from\s+["'](\.\.\/)+logger(\.js)?["']/.test(loggerNoComments)) {
      fail("lib/logger.ts 仍 import 外层 logger（禁止委托顶层；须本文件含 createLogger 本体）");
    } else if (!/export\s+function\s+createLogger/.test(loggerNoComments)) {
      fail("lib/logger.ts 缺 export function createLogger（须完整副本，禁止只 re-export）");
    } else if (!/export\s+const\s+logger\s*=/.test(loggerNoComments)) {
      fail("lib/logger.ts 缺 export const logger（业务只认本夹实例）");
    } else if (!/function\s+formatDataJson/.test(loggerNoComments)) {
      fail("lib/logger.ts 缺 formatDataJson（data 须 indent-2 多行；有 __code 禁止 compact）");
    } else if (!/每条前空一行/.test(loggerSrc)) {
      fail("lib/logger.ts 的 emit 未按 §5.3.16 加空行（每条前 + msg/explain/data 之间）");
    } else {
      ok("lib/logger.ts 本地完整副本（含多行 data + 空行）");
    }
  }
}

module.exports = { checkCrossImports, checkLogger };
