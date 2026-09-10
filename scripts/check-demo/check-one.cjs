/**
 * 查一条 Demo。新的「每一条都查」的检测项：在本文件 require，并加到下面函数调用列表里。
 * 怎么建文件、用 fail/ok、何时豁免：见 ../check-demo.cjs 文件头。
 */
const path = require("node:path");
const { APPS } = require("./paths.cjs");
const { createReporter } = require("./report.cjs");
const { checkStructure } = require("./check-structure.cjs");
const { checkComponentsAndUtils, checkHtmlPages } = require("./check-frontend.cjs");
const { checkLineLimitsAndOneUrl } = require("./limits.cjs");
const { checkCrossImports, checkLogger } = require("./check-imports.cjs");
const { checkDemoPorts } = require("./check-ports.cjs");

function checkOne(root, parser) {
  const { fail, ok, getFailed } = createReporter();
  const ctx = {
    root,
    parser,
    fail,
    ok,
    publicDir: path.join(root, "public"),
    relRoot: path.relative(APPS, root),
    libDir: path.join(root, "lib"),
    routesDir: path.join(root, "routes"),
  };

  if (!checkStructure(ctx)) return getFailed();
  checkComponentsAndUtils(ctx);
  checkLineLimitsAndOneUrl(ctx);
  checkHtmlPages(ctx);
  checkCrossImports(ctx);
  checkLogger(ctx);
  checkDemoPorts(ctx);
  return getFailed();
}

module.exports = { checkOne };
