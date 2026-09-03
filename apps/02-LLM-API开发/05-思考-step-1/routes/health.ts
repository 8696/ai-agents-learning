/**
 * 职责：GET /health —— 环境元信息 + 四家官方方言表（只读，不调模型）。
 * 数据流：无 body → JSON；总览页填方言表，各页填页脚 #env-info。
 *
 * 强制字段：ok / port / provider（本条为 null，不跟顶层 LLM_PROVIDER）/ model / hasKey。
 * 四家就绪表放 providers，是附加字段，不是替换上面那五个。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  getCatalogLabel,
  getLlmForProvider,
  listProductionLlms,
  PRODUCTION_PROVIDER_IDS,
} from "../../../llm.js";
import { officialCards } from "../lib/dialect/thinking-dialect.js";
import { PORT } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    const ready = listProductionLlms();
    const readyIds = new Set(ready.map((item) => item.provider));
    ctx.body = {
      ok: true,
      port: PORT,
      provider: null,
      model: "多提供商对照",
      hasKey: ready.length > 0,
      providers: PRODUCTION_PROVIDER_IDS.map((id) => {
        const llm = getLlmForProvider(id);
        const cards = officialCards(id);
        return {
          id,
          label: getCatalogLabel(id),
          ready: readyIds.has(id),
          modelA: llm?.modelA ?? "",
          modelB: llm?.modelB ?? "",
          baseUrlA: llm?.baseUrlA ?? "",
          baseUrlB: llm?.baseUrlB ?? "",
          dialect: { a: cards.a, b: cards.b },
        };
      }),
    };
  });
}
