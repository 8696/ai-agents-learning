/**
 * 职责：装配层。只挂路由、静态页、端口，不写业务。
 * 数据流：bodyParser → routes → serve(public/) → listen。
 * 为什么单独成文件：yarn 入口必须是 server.ts；本步核心在 lib/flow/skill-catalog.ts。
 */
import { bodyParser } from "@koa/bodyparser";
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountForce500Routes } from "./routes/force-500.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSkillsModeFullRoutes } from "./routes/skills-mode-full.js";
import { mountSkillsModeCatalogRoutes } from "./routes/skills-mode-catalog.js";
import { mountSkillsModeOnDemandRoutes } from "./routes/skills-mode-on-demand.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountSkillsModeFullRoutes(router);
mountSkillsModeCatalogRoutes(router);
mountSkillsModeOnDemandRoutes(router);
mountForce500Routes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  logger.info(
    "server.start",
    "listening",
    "为什么写这条日志：服务起来的那一刻就要写文件日志。当前：Skills vs MCP 第三步，10 个技能短目录 + 三种装载模式（full / catalog-only / on-demand）对照，不调大模型。分类题 + 三种提示词入口见 step-2（端口 50137）。",
    { url, protocol: "local" },
  );
  console.log(`  浏览器:    ${url}`);
});