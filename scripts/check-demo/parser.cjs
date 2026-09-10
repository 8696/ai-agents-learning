const path = require("node:path");
const { createRequire } = require("node:module");
const { APPS } = require("./paths.cjs");

function loadParser() {
  const req = createRequire(path.join(APPS, "package.json"));
  try {
    return req("@babel/parser");
  } catch {
    console.error("缺 @babel/parser。在 apps/ 执行：yarn install");
    process.exit(2);
  }
}

module.exports = { parser: loadParser() };
