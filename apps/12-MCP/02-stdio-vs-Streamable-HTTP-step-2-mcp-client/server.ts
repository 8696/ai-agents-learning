/**
 * 职责：装配 HTTP 服务（Client 端；不连 MCP，只暴露给浏览器用）。
 * 数据流：PORT → routes → public/ → listen 127.0.0.1
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealth } from "./routes/health.js";
import { mountHttpCallTool } from "./routes/http-call-tool.js";
import { mountHttpConnect } from "./routes/http-connect.js";
import { mountHttpGetPrompt } from "./routes/http-get-prompt.js";
import { mountHttpListPrompts } from "./routes/http-list-prompts.js";
import { mountHttpListResources } from "./routes/http-list-resources.js";
import { mountHttpListTools } from "./routes/http-list-tools.js";
import { mountHttpReadResource } from "./routes/http-read-resource.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealth(router);
mountHttpConnect(router);
mountHttpListTools(router);
mountHttpCallTool(router);
mountHttpListResources(router);
mountHttpReadResource(router);
mountHttpListPrompts(router);
mountHttpGetPrompt(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

const url = `http://127.0.0.1:${PORT}/`;
app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "调用函数开始：listen",
    "Client demo 起来；连远端 Server 是按需发生的（第一次调 MCP 才 connect）。",
    { 入参: { PORT, url } },
  );
  logger.info(
    "server.start",
    "调用函数结束：listen",
    "当前：HTTP 入口已打开。下一步：浏览器打开下面这个地址，点「连远端吧台」会真去 POST 远端 50134/mcp。",
    {
      返回值: { url },
      耗时ms: 0,
    },
  );
  // eslint-disable-next-line no-console
  console.log(url);
});