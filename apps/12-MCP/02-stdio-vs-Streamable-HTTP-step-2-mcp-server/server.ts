/**
 * 职责：装配 HTTP 服务。Server demo 只 listen 一个端口（koa），
 *       MCP endpoint 走同进程 koa 的 POST /mcp route。
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
import { mountMcpEndpoint } from "./routes/mcp-endpoint.js";
import { mountServerInfo } from "./routes/server-info.js";
import { connectMcpServer } from "./lib/flow/mcp-http-server.js";

async function main() {
  // ── 先把 McpServer 和 Transport 接上 ──
  await connectMcpServer();

  // ── 启 koa：MCP endpoint（POST /mcp）+ 浏览器状态页（GET /）─
  const app = new Koa();
  const router = new Router();

  app.use(bodyParser());
  mountHealth(router);
  mountServerInfo(router);
  mountMcpEndpoint(router);
  app.use(router.routes()).use(router.allowedMethods());

  const publicDir = fileURLToPath(new URL("./public", import.meta.url));
  app.use(serve(publicDir));

  const url = `http://127.0.0.1:${PORT}/`;
  app.listen(PORT, "127.0.0.1", () => {
    logger.info(
      "server.start",
      "调用函数开始：listen",
      "Browser-facing koa 起来；MCP endpoint 走同 koa 的 POST /mcp（只 listen 一个端口）。",
      { 入参: { PORT, url } },
    );
    logger.info(
      "server.start",
      "调用函数结束：listen",
      "Server demo 完全启动。下一步起 Client demo（另一个进程）连 50134/mcp。",
      {
        返回值: { url, mcpEndpoint: `http://127.0.0.1:${PORT}/mcp` },
        耗时ms: 0,
      },
    );
    // eslint-disable-next-line no-console
    console.log(url);
  });
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Server demo 启动失败：", err);
  process.exit(1);
});