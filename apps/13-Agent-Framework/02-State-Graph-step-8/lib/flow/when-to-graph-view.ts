/**
 * 职责：把「该不该上图」页的声明步骤、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 展示代码字面量（来自 when-to-graph-source.ts）→ DeclarationStep[]。
 * 为什么单独成文件：跑图的主路径在 when-to-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { ANSWER_OPEN_HOURS, DEFAULT_QUESTION } from "./when-to-graph.js";
import {
  ANSWER_DIRECT_CODE,
  EDGES_FLAT,
  EDGES_OVER_GRAPHED,
  JUDGMENT_RULE,
  NODE_CODE_BY_NAME_WHEN_TO_GRAPH,
  OVER_GRAPHED_CODE,
  STATE_CODE_WHEN_TO_GRAPH,
} from "./when-to-graph-source.js";

export type WhenToGraphDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type WhenToGraphGraphView = {
  questionDefault: string;
  answerOpenHours: string;
  declaration: WhenToGraphDeclarationStep[];
  nodeCodes: Record<string, string>;
  overGraphedCode: string;
};

export function describeWhenToGraph(): WhenToGraphGraphView {
  return {
    questionDefault: DEFAULT_QUESTION,
    answerOpenHours: ANSWER_OPEN_HOURS,
    declaration: [
      {
        id: "state",
        title: "① 状态标注（含 stationsRun 计数）",
        why: "stationsRun 是这一小节的关键观察字段——flat 模式跑 1 站，over-graphed 模式跑 3 站，可观察的代价直接写进状态。",
        code: STATE_CODE_WHEN_TO_GRAPH,
      },
      {
        id: "flat-node",
        title: "② answerDirect 节点（flat 模式）",
        why: "FAQ 类问题——一次回话即可，不上图。教学点：**单节点直接给答案就是这类问题的正确形状**。",
        code: ANSWER_DIRECT_CODE,
      },
      {
        id: "over-graphed",
        title: "③ over-graphed 三个浪费节点",
        why: "takeOrder / brewHot / serve 三站被 FA 过了，但写入的字段（orderSlip / cupLabel / pickupCall）和「店几点关门」毫无关系。**runtime 长度 + 写入了无关字段 = 硬套图的代价**。",
        code: OVER_GRAPHED_CODE,
      },
      {
        id: "edges-flat",
        title: "④ flat 边（START → answerDirect → END）",
        why: "单步一条边——这是「不上图」的图。",
        code: EDGES_FLAT,
      },
      {
        id: "edges-over",
        title: "⑤ over-graphed 边（START → takeOrder → brewHot → serve → END）",
        why: "完整进出图——但对于 FAQ 来说，每一站都是浪费。",
        code: EDGES_OVER_GRAPHED,
      },
      {
        id: "judgment",
        title: "⑥ 判断口诀（变体 J 教学点）",
        why: "**步骤能提前画出来 → 上图**；**下一步只有模型临场才知道 → 留给模块 07 那种循环**。反例：FAQ「店几点关门」硬套出杯图——runtime 3 站写入三个跟问题无关的字段。",
        code: JUDGMENT_RULE,
      },
    ],
    nodeCodes: NODE_CODE_BY_NAME_WHEN_TO_GRAPH,
    overGraphedCode: OVER_GRAPHED_CODE,
  };
}