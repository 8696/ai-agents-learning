/**
 * 职责：装配层。只挂路由、静态页、端口，不写业务。
 * 数据流：bodyParser → routes → serve(public/) → listen。
 * 为什么单独成文件：yarn 入口必须是 server.ts；分类题主路径在 lib/flow/classify.ts；三种提示词入口主路径在 lib/flow/prompt-source.ts。
 */
import { bodyParser } from "@koa/bodyparser";
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountClassifyRoutes } from "./routes/classify.js";
import { mountForce500Routes } from "./routes/force-500.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountPromptSourceMcpPromptRoutes } from "./routes/prompt-source-mcp-prompt.js";
import { mountPromptSourceSkillRoutes } from "./routes/prompt-source-skill.js";
import { mountPromptSourceSystemPromptRoutes } from "./routes/prompt-source-system-prompt.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountClassifyRoutes(router);
mountPromptSourceMcpPromptRoutes(router);
mountPromptSourceSkillRoutes(router);
mountPromptSourceSystemPromptRoutes(router);
mountForce500Routes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  logger.info(
    "server.start",
    "listening",
    "为什么写这条日志：服务起来的那一刻就要写文件日志。当前：Skills vs MCP 第二步，分类题（需求 5 / 6）+ 三种提示词入口（需求 7），不调大模型。三装配 / system prompt 装载见 step-1（yarn app:12-03-skills-vs-mcp-step-1，端口 50136）。",
    { url, protocol: "local" },
  );
  console.log(`  浏览器:    ${url}`);
});
