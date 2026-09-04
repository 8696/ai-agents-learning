/**
 * 职责：GET /health —— 只读环境信息 + 两版默认 Prompt，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, defaults, samples }。
 *
 * 日志（§5.3.16）：health.hit —— GET 一次打一次，便于核对面板默认值是不是和当前 presets 同步。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { DEFAULT_PROMPTS, SAMPLE_QUESTIONS, SYSTEM_PROMPT } from "../lib/version/presets.js";
import { logger } from "../lib/logger.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    logger.info(
      "health.hit",
      "GET /health",
      "前端拉环境 + 默认 Prompt；记 hasKey / model 便于核对当前 provider 配置（不调模型所以不打 LLM 层）",
      {
        provider: llm?.provider ?? null,
        model: llm?.modelA ?? null,
        hasKey: Boolean(llm),
        samplesCount: SAMPLE_QUESTIONS.length,
      },
    );
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      system: SYSTEM_PROMPT,
      defaults: DEFAULT_PROMPTS,
      samples: SAMPLE_QUESTIONS,
    };
  });
}
