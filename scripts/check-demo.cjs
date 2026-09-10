#!/usr/bin/env node
/**
 * 对照 agents/05-demo.md §5.3 的静态校验。只读，不改文件。
 *
 * 用法：
 *   node scripts/check-demo.cjs                         # 扫 apps/ 下全部 HTTP Demo
 *   node scripts/check-demo.cjs apps/01-…/02-Token      # 只查一条
 *
 * 实现拆在 scripts/check-demo/（按功能分文件）；本文件只做入口。
 * JSX 语法检查用 apps/ 的 @babel/parser（yarn install 即有，不另下 2.8MB vendor）。
 * 2026-09-10 起拦业务 route / HTML / lib / components 行数上限，以及 routes/ 下每个 .ts 一个业务 URL 一个文件（§5.3.8）。
 *
 * 以后加新检测项，按这几步接（不要把检查逻辑写回本入口）：
 *   1. 先分清：是「每一条 Demo 都查」还是「全仓库只查一次」（例如端口是否重复、yarn 脚本是不是 CLI）。
 *   2. 已有同类文件就改那个文件，不要另起一堆小文件：
 *        目录结构 / server.ts / routes / lib / /health → check-structure.cjs
 *        组件、CDN、页面必有的 id                       → check-frontend.cjs
 *        行数上限、一个业务 URL 一个 route 文件         → limits.cjs
 *        跨小节 import、本地 logger                     → check-imports.cjs
 *        端口三处一致 / 全仓库不重复 / yarn 入口        → check-ports.cjs
 *   3. 新的一类检测：新建 scripts/check-demo/check-xxx.cjs，导出函数。
 *      入参用 ctx（里面有 root / fail / ok；页面相关还有 publicDir / parser）。
 *      不合格调 fail("中文原因")，合格调 ok("短句")。只读，不要改被查的 Demo 文件。
 *      扫目录、相对路径用 paths.cjs 的 walk / posixRel，不要再复制一份。
 *   4. 接进主流程：
 *      「每一条 Demo」→ 在 check-one.cjs 里 require，按检查顺序调用。
 *      「全仓库一次」→ 在 index.cjs 里 require；只在没传路径、扫全部时再跑
 *      （跟 checkPortUniqueness / checkNoCliScripts 一样）。
 *   5. 旧 Demo 当时已经超标、新文件不准再超：才加豁免名单（看 limits.cjs 的 GRANDFATHER）。
 *      默认不要豁免。复制旧 step 做下一步时，豁免也不跟过去。
 *   6. 接完跑：node scripts/check-demo.cjs
 *      以及 node scripts/check-demo.cjs apps/{那一条文件夹}
 */
require("./check-demo/index.cjs");
