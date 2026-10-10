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
import { mountKBNodeRoutes } from "./routes/kb-node.js";
import { mountAgentNodeWithKBRoutes } from "./routes/agent-node-with-kb.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountKBNodeRoutes(router);
mountAgentNodeWithKBRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-8 教学要点：两栏对照「知识库节点 vs Agent 循环节点」—— 左栏知识库节点（拖一个 KB 检索节点）：调一次 mock KB 检索 → 拿到 top-1 → 输出（**不循环**）。右栏 Agent 循环节点（带 KB + LLM 汇总）：while：调 KB → 模型看 KB → 再调 KB → 调 LLM 汇总。教学点：拖一个知识库节点 ≠ Agent 循环 ——「它会自己循环查资料」是对「Agent 循环节点」的脑补，不是对「知识库节点」的脑补。本 step 不调大模型（§5.3.0 例外）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local-mock",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});