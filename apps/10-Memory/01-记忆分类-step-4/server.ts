/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * 路由清单（每个业务一个文件，§5.7）：
 *   GET    /health                          → routes/health.ts
 *   POST   /api/chat                        → routes/chat.ts（多轮对话入口）
 *   GET    /api/facts                       → routes/facts.ts
 *   DELETE /api/facts                       → routes/facts.ts
 *   GET    /api/program-rules               → routes/program-rules.ts
 *   POST   /api/program-rules               → routes/program-rules.ts
 *   DELETE /api/program-rules/:id           → routes/program-rules.ts
 *   POST   /api/classify                    → routes/classify.ts（新增用户记忆：调模型判类 + 3 道把关 + 写入 facts.json）
 *   POST   /api/force-error                 → routes/force-error.ts
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { mountFactsRoutes } from "./routes/facts.js";
import { mountProgramRulesRoutes } from "./routes/program-rules.js";
import { mountClassifyRoutes } from "./routes/classify.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountChatRoutes(router);
mountFactsRoutes(router);
mountProgramRulesRoutes(router);
mountClassifyRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "记忆分类第四步：核心用户画像常驻 + 情景按问句召回 + 多轮对话。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});