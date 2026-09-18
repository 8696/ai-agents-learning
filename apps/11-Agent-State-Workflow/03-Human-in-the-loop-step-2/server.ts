/**
 * 职责：装配层。只挂路由、静态页、端口，不写业务。
 * 数据流：initState（从磁盘恢复 pending / ledger）→ bodyParser → routes → serve(public/) → listen。
 * 为什么单独成文件：yarn 入口必须是 server.ts；业务在 routes/ 和 lib/flow/。
 */
import { bodyParser } from "@koa/bodyparser";
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { initState } from "./lib/flow/transfer-state.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSnapshotRoutes } from "./routes/snapshot.js";
import { mountProposeRoutes } from "./routes/propose.js";
import { mountApproveRoutes } from "./routes/approve.js";
import { mountRejectRoutes } from "./routes/reject.js";
import { mountEditRoutes } from "./routes/edit.js";
import { mountReadRoutes } from "./routes/read.js";
import { mountResetRoutes } from "./routes/reset.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountSnapshotRoutes(router);
mountProposeRoutes(router);
mountApproveRoutes(router);
mountRejectRoutes(router);
mountEditRoutes(router);
mountReadRoutes(router);
mountResetRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

await initState();

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "服务起好了；step-2 教学要点：等人期间靠检查点活着，杀掉进程再起来 pending 仍在、钱没动。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "local" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
