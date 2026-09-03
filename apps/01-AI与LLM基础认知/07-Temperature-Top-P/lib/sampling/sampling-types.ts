/**
 * 职责：采样对照实验的数据形状（一次调用 / 一档参数 / 一次扫描 / 一次重复）。
 * 数据流：flow 层产出这些对象 → routes 原样写进 ctx.body → 页面卡片按字段渲染。
 * 为什么单独成文件：前后端靠这份形状对齐。类型和调用逻辑混在一起时，
 *   改一个字段名很容易只改了后端、页面还在读旧字段，跑出来是一片空白卡片。
 */

/** 一次调用真正发给模型的两个旋钮。 */
export type SamplingParams = {
  temperature: number;
  topP: number;
};

/** 一次调用的结果。失败不抛出去，而是留在数组里——一次失败不该让整组结果消失。 */
export type SingleRun = {
  /** 第几次（从 1 开始），页面直接显示 */
  index: number;
  text: string;
  durationMs: number;
  error?: string;
};

/**
 * 一档参数跑完 N 次之后的判定。
 * STABLE   = 全部成功且逐字相同
 * DIVERGED = 全部成功但出现了不止一种说法
 * PARTIAL  = 有成功有失败，稳定性无法判定
 * FAILED   = 全部失败
 */
export type Verdict = "STABLE" | "DIVERGED" | "PARTIAL" | "FAILED";

/** 一张卡片 = 一档参数。 */
export type GroupResult = {
  /** 卡片标题，如 "T = 0" / "top_p = 0.9"；由 flow 层按扫描轴生成 */
  label: string;
  temperature: number;
  topP: number;
  runs: SingleRun[];
  /** 去重后的回答；长度 1 表示这一档完全稳定 */
  distinctTexts: string[];
  distinctCount: number;
  /** null = 这一组有失败，判不了 */
  same: boolean | null;
  verdict: Verdict;
  verdictLabel: string;
};

/** 扫描轴：这次动的是哪个旋钮。页面据此决定卡片标题和「被固定住的是谁」。 */
export type SweepAxis = "temperature" | "top_p";

/** 被固定住的那个旋钮——页面必须显示它，否则读者会以为两个参数都在动。 */
export type FixedKnob = {
  param: SweepAxis;
  value: number;
};

export type SweepResponse = {
  axis: SweepAxis;
  fixed: FixedKnob;
  prompt: string;
  provider: string;
  model: string;
  runsPerGroup: number;
  groups: GroupResult[];
  durationMs: number;
};

export type RepeatResponse = {
  prompt: string;
  provider: string;
  model: string;
  runs: number;
  params: SamplingParams;
  group: GroupResult;
  durationMs: number;
};
