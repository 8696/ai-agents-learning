/**
 * 职责：装配层。只挂路由、静态页、端口，不写业务。
 * 数据流：bodyParser → routes → serve(public/) → listen。
 * 为什么单独成文件：yarn 入口必须是 server.ts；出杯主路径在 lib/flow/run-assembly.ts。
 */
import { bodyParser } from "@koa/bodyparser";
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountAssemblyBothRoutes } from "./routes/assembly-both.js";
import { mountAssemblyMcpOnlyRoutes } from "./routes/assembly-mcp-only.js";
import { mountAssemblyOnDemandRoutes } from "./routes/assembly-on-demand.js";
import { mountAssemblySkillOnlyRoutes } from "./routes/assembly-skill-only.js";
import { mountAssemblySystemPromptFullRoutes } from "./routes/assembly-system-prompt-full.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountHealthRoutes } from "./routes/health.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountAssemblyMcpOnlyRoutes(router);
mountAssemblySkillOnlyRoutes(router);
mountAssemblyBothRoutes(router);
mountAssemblySystemPromptFullRoutes(router);
mountAssemblyOnDemandRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  logger.info(
    "server.start",
    "listening",
    "为什么写这条日志：服务起来的那一刻就要写文件日志。当前：Skills vs MCP 第一步，五条装配对照（三种装配 + 两种 system prompt 装载），不调大模型。",
    { url, protocol: "local" },
  );
  console.log(`  浏览器:    ${url}`);
});
