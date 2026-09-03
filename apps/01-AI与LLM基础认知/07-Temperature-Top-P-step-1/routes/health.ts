/**
 * 职责：GET /health —— 只读环境信息 + 本 Demo 的教学档位，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, ladders, defaults }；
 *   四个页面加载时都打一次，用来填页脚 #env-info 并决定主按钮是否 disabled。
 * 为什么把档位也回出去：页面不写死梯子，改 presets.ts 时前后端一起变。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import {
  DEFAULT_PROMPT,
  DEFAULT_REPEAT_RUNS,
  DEFAULT_RUNS_PER_GROUP,
  DEFAULT_SWEEP_TEMPERATURE,
  FIXED_TOP_P,
  TEMPERATURE_LADDER,
  TOP_P_LADDER,
} from "../lib/sampling/presets.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      // provider / model 只能从这里来：页面写死模型名，换 LLM_PROVIDER 后页脚就在骗人。
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      ladders: { temperature: TEMPERATURE_LADDER, topP: TOP_P_LADDER },
      defaults: {
        prompt: DEFAULT_PROMPT,
        runsPerGroup: DEFAULT_RUNS_PER_GROUP,
        repeatRuns: DEFAULT_REPEAT_RUNS,
        fixedTopP: FIXED_TOP_P,
        sweepTemperature: DEFAULT_SWEEP_TEMPERATURE,
      },
    };
  });
}
