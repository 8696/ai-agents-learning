/**
 * 职责：按请求里的 modes 并行打 v1 / v2，聚合成对照结果。
 * 数据流：{ llm, text, modes, prompts } → Promise.all(runOne) → 带 versions 元信息的包。
 */
import type { Llm } from "../../../../llm.js";
import { VERSION_NAMES, type Mode } from "../version/presets.js";
import { runOne, type CompareFail, type CompareRow } from "./run-one.js";

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
  const results = await Promise.all(
    uniqueModes.map((mode) =>
      runOne({
        llm: input.llm,
        mode,
        text: input.text,
        promptSuffix: input.prompts[mode],
      }),
    ),
  );

  const upstreamFail = results.find((row): row is CompareFail => row.ok === false);
  const allFailed =
    upstreamFail && results.every((row) => row.ok === false) ? upstreamFail : null;

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
