/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写 JSON-RPC。
 * 数据流：PORT → routes → public/pages/topology.html → listen 127.0.0.1
 *
 * 本步按 serverId 拆两个 route 文件（ticket / kb）。客户端一对一专线由 URL 路径表达——不可能误连。
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
import { mountKbInitialize } from "./routes/kb-initialize.js";
import { mountKbPromptsGet } from "./routes/kb-prompts-get.js";
import { mountKbPromptsList } from "./routes/kb-prompts-list.js";
import { mountKbResourcesList } from "./routes/kb-resources-list.js";
import { mountKbResourcesRead } from "./routes/kb-resources-read.js";
import { mountKbToolsCall } from "./routes/kb-tools-call.js";
import { mountKbToolsList } from "./routes/kb-tools-list.js";
import { mountTicketInitialize } from "./routes/ticket-initialize.js";
import { mountTicketPromptsGet } from "./routes/ticket-prompts-get.js";
import { mountTicketPromptsList } from "./routes/ticket-prompts-list.js";
import { mountTicketResourcesList } from "./routes/ticket-resources-list.js";
import { mountTicketResourcesRead } from "./routes/ticket-resources-read.js";
import { mountTicketToolsCall } from "./routes/ticket-tools-call.js";
import { mountTicketToolsList } from "./routes/ticket-tools-list.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealth(router);
mountTicketInitialize(router);
mountTicketToolsList(router);
mountTicketToolsCall(router);
mountTicketResourcesList(router);
mountTicketResourcesRead(router);
mountTicketPromptsList(router);
mountTicketPromptsGet(router);
mountKbInitialize(router);
mountKbToolsList(router);
mountKbToolsCall(router);
mountKbResourcesList(router);
mountKbResourcesRead(router);
mountKbPromptsList(router);
mountKbPromptsGet(router);
mountForceError(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

const url = `http://127.0.0.1:${PORT}/`;
app.listen(PORT, "127.0.0.1", () => {
  const t0 = Date.now();
  logger.info("server.start", "调用函数开始：listen", "服务起来就要写文件日志。step-3 教学要点：拓扑 + 解耦。", {
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