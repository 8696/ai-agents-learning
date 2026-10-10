/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写主流程、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / conditional-branch / edge-table-check / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountConditionalBranchRoutes } from "./routes/conditional-branch.js";
import { mountEdgeTableCheckRoutes } from "./routes/edge-table-check.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountConditionalBranchRoutes(router);
mountEdgeTableCheckRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-4 教学要点：两栏对照「条件分支 vs 边表核对」—— 左栏条件分支只按 intent 选边，不拦非法转移；右栏边表核对按 declared edgeTable 拒绝不在名单的下一站。三个 case（热饮+已付款 / 冰饮+已付款 / 未付款想出品+未付款）。硬钉子：「脑补产品会拦 = 错」—— 拦截按你 declared 的边表为准，不是产品替你拦。本 step 不调大模型（§5.3.0 例外）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local-mock",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});