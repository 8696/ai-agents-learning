/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写主流程、不调模型。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountHumanOnlyRoutes } from "./routes/human-only.js";
import { mountHumanWithCheckpointRoutes } from "./routes/human-with-checkpoint.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountHumanOnlyRoutes(router);
mountHumanWithCheckpointRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-7 教学要点：两栏对照「人工方块 vs 检查点 + idempotency」—— 左栏仅人工方块（没写 checkpoint + 没做 idempotency），kill before-charge 模拟下重启 = 重复扣款；右栏人工方块 + checkpoint 持久化 + idempotency_key 去重，kill before-charge 模拟下重启 = 不重复扣款。硬钉子：「等点头」方块（产品界面）≠ 检查点 + idempotency —— 你自己写的字段才是 kill 后能恢复的。本 step 不调大模型（§5.3.0 例外）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local-mock",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});