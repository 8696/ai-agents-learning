/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * 本步（step-5）在 step-4 之上扩 enablePii 维度（接口路径 /api/filter-dimensions 不变，body 加 enablePii 字段），
 * 保留 step-1 的 mountExtractRoutes + step-2 的 mountFilterRoutes 作前几步的对照基线。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountExtractRoutes } from "./routes/extract.js";
import { mountFilterRoutes } from "./routes/filter.js";
import { mountFilterDimensionsRoutes } from "./routes/filter-dimensions.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountExtractRoutes(router);
mountFilterRoutes(router);
mountFilterDimensionsRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "写入策略第五步：在 step-4 内容维度 A/B/C 之上加敏感信息过滤（个人身份信息 PII / 合规）一道闸门，让模型在同一次调用里同时判四道标签（A/B/C/PII），把把关这一关剩 2 把刀中的这一把做掉。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
