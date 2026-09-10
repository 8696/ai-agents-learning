/**
 * 职责：按请求里的 modes 并行打 v1 / v2，聚合成对照结果。
 * 数据流：{ llm, text, modes, prompts } → Promise.all(runOne) → 带 versions 元信息的包。
 *
 * 日志（§5.3.16）：调用函数 五条日志（compareVersions 编排层封装）；
 *   循环里每圈打「调用循环」便于核对「每版都跑完」；子调用 runOne 内部已自带五条日志。
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
  const tFuncStart = Date.now();
  const uniqueModes = [...new Set(input.modes)];

  logger.info(
    "│ 对照-compareVersions",
    "调用函数开始：compareVersions",
    "为什么写这条日志：route 只认这一层返回的对照包；里面 N 路 runOne 是真正干活的那一层。当前：即将并发跑 uniqueModes；前端请求 modes 决定跑几版。",
    {
      入参: { uniqueModes, textPreview: input.text.slice(0, 50), textLen: input.text.length, v1SuffixLen: input.prompts.v1.length, v2SuffixLen: input.prompts.v2.length },
      __code: `const results = await Promise.all(uniqueModes.map(mode => runOne({ llm, mode, text, promptSuffix: prompts[mode] })));`,
    },
  );

  const results = await Promise.all(
    uniqueModes.map((mode, i) => {
      const round = i + 1;
      const tRoundStart = Date.now();
      logger.info(
        "││ 调用循环-compareVersions",
        `调用循环开始：第 ${round} 轮 / 共 ${uniqueModes.length} 轮`,
        "为什么写这条日志：本条对照实验，每版要独立写满循环五条日志，便于核对「两版确实是并发跑的、不是串行」。当前：第 N 版即将 runOne。",
        {
          第几轮: round,
          本轮为什么是这些参数: {
            mode,
            promptSuffixPreview: input.prompts[mode].slice(0, 60),
            reason: "两版只换这一段 suffix；其余条件保持一致。",
          },
        },
      );
      return runOne({
        llm: input.llm,
        mode,
        text: input.text,
        promptSuffix: input.prompts[mode],
      }).then((row) => {
        logger.info(
          "││ 调用循环-compareVersions",
          `调用循环结束：第 ${round} 轮`,
          "为什么写这条日志：每一版的 preview / hasReasoning 是页面上并排两卡片的判稳依据。当前：runOne 已返回。",
          {
            第几轮: round,
            本轮结果: { mode: row.mode, ok: row.ok, textLen: row.ok ? row.textLen : 0, hasReasoning: row.ok ? row.hasReasoning : false },
            耗时ms: Date.now() - tRoundStart,
          },
        );
        return row;
      });
    }),
  );

  const upstreamFail = results.find((row): row is CompareFail => row.ok === false);
  const allFailed =
    upstreamFail && results.every((row) => row.ok === false) ? upstreamFail : null;

  logger.info(
    "│ 对照-compareVersions",
    "调用函数结束：compareVersions",
    "为什么写这条日志：route 要把对照包（input / versions / results / allFailed）写进 ctx.body 交给页面 stats 区；打聚合结果便于核对「v1 vs v2 谁挂了」。当前：Promise.all 已返回。",
    {
      返回值: {
        resultsCount: results.length,
        allFailed: allFailed ? { status: allFailed.status, error: allFailed.error } : null,
      },
      耗时ms: Date.now() - tFuncStart,
      字段释义: {
        allFailed: "两版都失败时才返回上游码（route 用它决定 HTTP 状态）",
      },
    },
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