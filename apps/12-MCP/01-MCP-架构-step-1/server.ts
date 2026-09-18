/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写 JSON-RPC。
 * 数据流：PORT → routes → public/ → listen 127.0.0.1
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountForceError } from "./routes/force-error.js";
import { mountHealth } from "./routes/health.js";
import { mountInitialize } from "./routes/initialize.js";
import { mountPromptsGet } from "./routes/prompts-get.js";
import { mountPromptsList } from "./routes/prompts-list.js";
import { mountResourcesList } from "./routes/resources-list.js";
import { mountResourcesRead } from "./routes/resources-read.js";
import { mountToolsCall } from "./routes/tools-call.js";
import { mountToolsList } from "./routes/tools-list.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealth(router);
mountInitialize(router);
mountToolsList(router);
mountToolsCall(router);
mountResourcesList(router);
mountResourcesRead(router);
mountPromptsList(router);
mountPromptsGet(router);
mountForceError(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

const url = `http://127.0.0.1:${PORT}/`;
app.listen(PORT, "127.0.0.1", () => {
  const t0 = Date.now();
  logger.info("server.start", "调用函数开始：listen", "服务起来就要写文件日志。step-1 教学要点：先初始化，再列出工具，再调用工具。", {
    入参: { PORT, url },
  });
  logger.info("server.start", "调用函数入参：listen", "当前：已经绑定 127.0.0.1。", { 入参: { PORT, url } });
  logger.info("server.start", "调用函数：listen", "当前：HTTP 入口已打开。", {
    入参: { PORT, url },
    __code: "app.listen(PORT, \"127.0.0.1\", callback)",
  });
  logger.info("server.start", "调用函数返回值：listen", "当前：打开下面这个地址。", { 返回值: { url } });
  logger.info("server.start", "调用函数结束：listen", "当前：启动完成。", {
    耗时ms: Date.now() - t0,
    返回值: { url },
  });
  // eslint-disable-next-line no-console
  console.log(url);
});
