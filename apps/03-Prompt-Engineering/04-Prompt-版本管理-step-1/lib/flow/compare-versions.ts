/**
 * 职责：按请求里的 modes 并行打 v1 / v2，聚合成对照结果。
 * 数据流：{ llm, text, modes, prompts } → Promise.all(runOne) → 带 versions 元信息的包。
 *
 * 日志（§5.3.16）：compare.start / compare.one-done（每个 mode 一行）/ compare.done。
 *   每个 mode 的 llm.request/response 在 run-one 里打；这里只打编排层。
 */
import type { Llm } from "../../../../llm.js";
import { VERSION_NAMES, type Mode } from "../version/presets.js";
import { runOne, type CompareFail, type CompareRow } from "./run-one.js";
import { logger } from "../logger.js";

export async function compareVersions(input: {
  llm: Llm;
  text: string;
  modes: Mode[];
  prompts: { v1: string; v2: string };
}): Promise<{
  input: string;
  versions: {
    v1: { name: string; suffix: string };
    v2: { name: string; suffix: string };
  };
  results: CompareRow[];
  allFailed: CompareFail | null;
}> {
  const uniqueModes = [...new Set(input.modes)];
  logger.info(
    "compare.start",
    "起 N 路并行跑对照",
    `前端请求 modes=${JSON.stringify(uniqueModes)}；并行打对应版本，每版 LLM 调用细节在 run-one.ts 里打（llm.request/response），这里只记编排维度`,
    {
      uniqueModes,
      textLen: input.text.length,
      v1SuffixLen: input.prompts.v1.length,
      v2SuffixLen: input.prompts.v2.length,
    },
  );

  const results = await Promise.all(
    uniqueModes.map((mode) =>
      runOne({
        llm: input.llm,
        mode,
        text: input.text,
        promptSuffix: input.prompts[mode],
      }).then((row) => {
        logger.info(
          "compare.one-done",
          `[${mode}] 返回`,
          `单版（${mode}）已收口；记 ok / textLen / hasReasoning 便于在聚合层一眼看哪版挂了 / 谁带推理`,
          { mode: row.mode, ok: row.ok, textLen: row.ok ? row.textLen : 0, hasReasoning: row.ok ? row.hasReasoning : false },
        );
        return row;
      }),
    ),
  );

  const upstreamFail = results.find((row): row is CompareFail => row.ok === false);
  const allFailed =
    upstreamFail && results.every((row) => row.ok === false) ? upstreamFail : null;

  logger.info(
    "compare.done",
    "聚合完成",
    `所有 modes 都跑完；记 results 数 + allFailed 状态让路由层决定要不要抬 HTTP 状态`,
    { resultsCount: results.length, allFailed: allFailed ? { status: allFailed.status, error: allFailed.error } : null },
  );

  return {
    input: input.text,
    versions: {
      v1: { name: VERSION_NAMES.v1, suffix: input.prompts.v1 },
      v2: { name: VERSION_NAMES.v2, suffix: input.prompts.v2 },
    },
    results,
    allFailed,
  };
}
