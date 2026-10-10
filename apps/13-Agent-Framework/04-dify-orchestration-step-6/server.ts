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
import { mountLLMNodeRoutes } from "./routes/llm-node.js";
import { mountAgentNodeRoutes } from "./routes/agent-node.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountLLMNodeRoutes(router);
mountAgentNodeRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-6 教学要点：两栏对照「单独一个大模型节点 vs 智能体节点」—— 左栏调一次 LLM（不传 tools），拿到 finalReply 但没查库存；右栏智能体节点（带 tools + while），先调 check_inventory 再回答。教学点：单次调用 ≠ Agent 循环 —— 「它会自动查库存」是对「智能体节点」的脑补，不是对「单独一个大模型节点」的脑补。两栏都真调大模型（§5.3.0 默认）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "openai-compatible",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});