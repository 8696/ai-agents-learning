/**
 * 主流程。新的「全仓库只查一次」的检测项：在本文件 require，
 * 放到下面 `if (!arg)` 里跟端口占用一起跑。怎么建文件见 ../check-demo.cjs 文件头。
 */
const fs = require("node:fs");
const path = require("node:path");
const { REPO, listDemos, expandTargets } = require("./paths.cjs");
const { parser } = require("./parser.cjs");
const { selfCheckBraceQuote } = require("./jsx.cjs");
const { checkOne } = require("./check-one.cjs");
const { checkNoCliScripts, checkPortUniqueness } = require("./check-ports.cjs");

function main() {
  selfCheckBraceQuote();

  const arg = process.argv[2];
  const targets = arg ? expandTargets([path.resolve(arg)]) : listDemos();

  if (targets.length === 0) {
    console.error("没有找到 server.ts");
    process.exit(2);
  }

  let total = 0;
  for (const demo of targets) {
    if (!fs.existsSync(demo)) {
      console.error("不存在：" + demo);
      process.exit(2);
    }
    console.log("\n── " + path.relative(REPO, demo) + " ──");
    total += checkOne(demo, parser);
  }
  if (!arg) {
    console.log("\n── yarn 入口 ──");
    total += checkNoCliScripts();
    console.log("\n── 端口占用 ──");
    total += checkPortUniqueness();
  }

  console.log(total === 0 ? "\n全部通过" : "\n失败 " + total + " 项");
  process.exit(total === 0 ? 0 : 1);
}

main();
