/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不直接连 MCP。
 * 数据流：PORT → routes → public/ → listen 127.0.0.1
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountStdioCallBogusTool } from "./routes/stdio-call-bogus-tool.js";
import { mountStdioCallTool } from "./routes/stdio-call-tool.js";
import { mountStdioConnect } from "./routes/stdio-connect.js";
import { mountStdioGetPrompt } from "./routes/stdio-get-prompt.js";
import { mountStdioListPrompts } from "./routes/stdio-list-prompts.js";
import { mountStdioListResources } from "./routes/stdio-list-resources.js";
import { mountStdioListTools } from "./routes/stdio-list-tools.js";
import { mountStdioReadBogusResource } from "./routes/stdio-read-bogus-resource.js";
import { mountStdioReadResource } from "./routes/stdio-read-resource.js";
import { mountHealth } from "./routes/health.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealth(router);
mountStdioConnect(router);
mountStdioListTools(router);
mountStdioCallTool(router);
mountStdioListResources(router);
mountStdioReadResource(router);
mountStdioCallBogusTool(router);
mountStdioReadBogusResource(router);
mountStdioListPrompts(router);
mountStdioGetPrompt(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

const url = `http://127.0.0.1:${PORT}/`;
app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "调用函数开始：listen",
    "服务起来就要写文件日志。step-1 教学要点：stdio Transport —— 服务端不连 MCP，由浏览器发请求时才真去 spawn 子进程。",
    { 入参: { PORT, url } },
  );
  logger.info(
    "server.start",
    "调用函数：listen",
    "当前：HTTP 入口已打开。stdio 子进程此刻还没起 —— 等第一次请求才 spawn。",
    {
      入参: { PORT, url },
      __code: "app.listen(PORT, \"127.0.0.1\", callback)",
    },
  );
  logger.info(
    "server.start",
    "调用函数结束：listen",
    "当前：启动完成。打开下面这个地址。",
    {
      返回值: { url },
      耗时ms: 0,
    },
  );
  // eslint-disable-next-line no-console
  console.log(url);
});
