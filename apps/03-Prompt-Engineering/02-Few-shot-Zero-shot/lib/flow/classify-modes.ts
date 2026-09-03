/**
 * 职责：按请求里的 modes 并行打 Zero / Few，聚合成对照结果。
 * 数据流：{ llm, text, modes } → Promise.all(classifyOne) → { product, system, input, results }。
 * 为什么和 classify-one 分文件：单次调用 vs 对照聚合是两层；route 只该看见聚合结果。
 */
import type { Llm } from "../../../../llm.js";
import { SYSTEM_PROMPT } from "../classify/presets.js";
import type { ClassifyFail, ClassifyRow, ShotMode } from "../classify/types.js";
import { classifyOne } from "./classify-one.js";

export async function classifyModes(input: {
  llm: Llm;
  text: string;
  modes: ShotMode[];
}): Promise<{
  product: string;
  system: string;
  input: string;
  results: ClassifyRow[];
  allFailed: ClassifyFail | null;
}> {
  const uniqueModes = [...new Set(input.modes)];
  const results = await Promise.all(
    uniqueModes.map((mode) =>
      classifyOne({ llm: input.llm, mode, text: input.text }),
    ),
  );

  const upstreamFail = results.find(
    (row): row is ClassifyFail => row.ok === false,
  );
  const allFailed =
    upstreamFail && results.every((row) => row.ok === false) ? upstreamFail : null;

  return {
    product: "豆谷评价分类",
    system: SYSTEM_PROMPT,
    input: input.text,
    results,
    allFailed,
  };
}
