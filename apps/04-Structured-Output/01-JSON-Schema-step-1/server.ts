/**
 * 模块 04 · 01 · JSON Schema · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa → routes/* → lib/schema/intent。
 *
 * 入口：cd apps && yarn app:04-01-json-schema-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";

import { logger } from "./lib/logger.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountParseRoutes } from "./routes/parse.js";
import { mountRepairRoutes } from "./routes/repair.js";
import { mountTransformRoutes } from "./routes/transform.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountParseRoutes(router);
mountRepairRoutes(router);
mountTransformRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.startup",
    "模块 04 · 01 JSON Schema Demo 已启动（Zod 本地 · 不调 LLM）",
    "启动横幅（不属于「调用」按 §5.3.16 不套五件套；记录端口、Provider、Model、Key 状态、可用端点）：本条对照 Zod 本地操作（parse / safeParse / transform / repair）——callsModel=false，Key 缺失也不影响主流程。",
    {
      port: PORT,
      bind: "127.0.0.1",
      callsModel: false,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm?.apiKey),
      endpoints: {
        "GET  /": "总览",
        "GET  /pages/parse.html": "parse vs safeParse 对照",
        "GET  /pages/repair.html": "issues → 喂回模型的修复文本",
        "GET  /pages/transform.html": "Zod.transform（补 repaired / when）",
        "GET  /health": "{ ok, port, provider, model, hasKey, callsModel:false, schema }",
        "POST /api/parse": "Body: { raw } → { parseOk, value, safeParse }",
        "POST /api/repair": "Body: { raw } → { success, issues, repairPrompt? }",
        "POST /api/transform": "Body: { raw } → { value: Enriched }",
      },
    },
  );
  console.log("──── 模块 04 · 01 JSON Schema Demo（Zod 本地 · 不调 LLM）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  parse        /pages/parse.html`);
  console.log(`  repair       /pages/repair.html`);
  console.log(`  transform    /pages/transform.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/parse · /api/repair · /api/transform`);
  console.log(`  Ctrl+C 退出`);
});
