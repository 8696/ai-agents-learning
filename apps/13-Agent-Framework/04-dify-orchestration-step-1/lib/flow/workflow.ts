/**
 * 本步核心（右栏）：工作流画布（Workflow）—— 节点和变量看得见，调度器和状态类型不可见。
 *
 * 职责：给定一句用户输入，返回一张固定画布的节点图 + 变量面板 + 灰显「调度器不在仓库里 / 状态类型不在仓库里」标记。
 *
 * 数据流：input.text → 固定节点图 + 变量值 → { nodes, edges, variables, hiddenMechanism }。
 *
 * 为什么单独成文件：右栏对照的核心 ——"画布上的方块和连线你能看懂，但跑图的代码不在你仓库"。
 * 这一栏**不调 LLM**（§5.3.0 例外「纯协议形状 / UI 渲染层演示」）：画布结构是固定的剧本，
 * 目的是对照"你在 Dify 里看见的方块 ↔ 模块 11 的节点 / 状态"是什么关系，不是真的去跑一张图。
 */
import { logger } from "../logger.js";

// ── 固定画布（与 docs/学习模块/.../04-Dify-等编排产品.md 「同一句热拿铁，三种走法」对照）──

const FIXED_NODES: Array<{ id: string; label: string; type: string; visible: boolean }> = [
  { id: "start",  label: "开始（收下句子，写入 user_text）", type: "input",  visible: true },
  { id: "llm",    label: "大模型节点（读 user_text，写出 drink_name / drink_type）", type: "llm", visible: true },
  { id: "branch", label: "条件分支（读 drink_type）",          type: "branch", visible: true },
  { id: "hot",    label: "回复节点「按热饮出品」",            type: "reply",  visible: true },
  { id: "iced",   label: "回复节点「按冰饮出品」",            type: "reply",  visible: true },
  { id: "end",    label: "结束",                              type: "output", visible: true },
];

const FIXED_EDGES: Array<{ from: string; to: string; label?: string }> = [
  { from: "start",  to: "llm" },
  { from: "llm",    to: "branch" },
  { from: "branch", to: "hot",  label: "drink_type=hot" },
  { from: "branch", to: "iced", label: "drink_type=iced" },
  { from: "hot",    to: "end" },
  { from: "iced",   to: "end" },
];

export type WorkflowOutput = {
  /** 节点列表 —— 学习者可见的方块 */
  nodes: typeof FIXED_NODES;
  /** 节点之间的连线 —— 边 */
  edges: typeof FIXED_EDGES;
  /** 一次运行里活在变量面板里的字段 —— 模块 11 的 state 字段 */
  variables: Record<string, unknown>;
  /** 灰显给学习者看的「这些不在仓库里」—— 模块 11 的核心：调度器和类型 */
  hiddenMechanism: {
    scheduler: string;
    stateType: string;
    edgeTableCheck: string;
  };
};

export function runWorkflowMock(inputText: string): WorkflowOutput {
  logger.info(
    "│ 调用函数-runWorkflowMock",
    "调用函数开始：runWorkflowMock",
    "为什么写这条日志：工作流画布对照 —— 不调大模型（§5.3.0 例外），只把固定节点图 + 变量面板 + 灰显「调度器不在仓库里」端给前端。目的：让学习者对照「画布上的方块 ↔ 模块 11 的节点」。",
    {
      入参: { text: inputText },
      __code: "const out = runWorkflowMock(text);",
    },
  );
  const t0 = Date.now();

  // 模拟一次运行的变量面板：固定结构 + 从 inputText 抽出 user_text
  const variables: Record<string, unknown> = {
    user_text: inputText,
    drink_name: "" /* 这一栏不画，因变量值在「产品里」 */,
    drink_type: "" /* 同上 */,
  };

  const out: WorkflowOutput = {
    nodes: FIXED_NODES,
    edges: FIXED_EDGES,
    variables,
    hiddenMechanism: {
      scheduler: "调度器（谁决定下一站 / 失败停在哪）—— 在产品服务器里，不在仓库",
      stateType: "状态类型（这是 declared 一份 TypeScript OrderState）—— 在产品变量面板里，不在你的类型文件",
      edgeTableCheck: "边表核对（按模块 11 第 7 步核对非法转移）—— 拦不拦要看这次运行，不能脑补",
    },
  };

  logger.info(
    "│ 调用函数-runWorkflowMock",
    "调用函数结束：runWorkflowMock",
    "为什么写这条日志：固定画布不变；只有 user_text 这一项跟着输入走。其他都不动 —— 这是「产品里的图是固定的」对照教学点。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}