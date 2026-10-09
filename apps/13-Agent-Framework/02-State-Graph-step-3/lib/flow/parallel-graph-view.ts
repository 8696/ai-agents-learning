/**
 * 职责：把并行扇出扇入图的声明步骤、路径映射、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 边表文案 + 展示代码字面量（来自 parallel-graph-source.ts）→ DeclarationStep[] + pathMap。
 * 为什么单独成文件：跑图的主路径在 parallel-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_PARALLEL } from "./parallel-graph.js";
import {
  BRANCH_HOT_ARRAY_CODE,
  BRANCH_HOT_DISTINCT_CODE,
  BRANCH_HOT_NO_REDUCER_CODE,
  BRANCH_ICE_ARRAY_CODE,
  BRANCH_ICE_DISTINCT_CODE,
  BRANCH_ICE_NO_REDUCER_CODE,
  BUILD_CODE,
  NODE_CODE_BY_NAME,
  PARALLEL_EDGES_CODE,
  SERVE_CODE,
  STATE_CODE_ARRAY_REDUCER,
  STATE_CODE_DISTINCT,
  STATE_CODE_NO_REDUCER,
  TAKE_ORDER_CODE,
} from "./parallel-graph-source.js";

export type ParallelDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type ParallelGraphView = {
  drinkDefault: string;
  declaration: ParallelDeclarationStep[];
  pathMap: Array<{ key: string; toNode: string; example: string }>;
  nodeCodes: Record<string, string>;
};

export function describeParallelGraph(): ParallelGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_PARALLEL,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（三选一的 reducer 决定并行怎么合）",
        why: "cupLabel 字段的 reducer 是这一课的核心开关。默认 lastWrite（覆盖）会冲突；改 appendArray 合并成 array；或干脆让两个分支写不同字段。三种声明的差别都在这一格里。",
        code: [
          "// 不写归约函数（默认 lastWrite）：框架会因并行冲突报错",
          STATE_CODE_NO_REDUCER,
          "",
          "// 写 array 归约函数：合并成 [冰，热]",
          STATE_CODE_ARRAY_REDUCER,
          "",
          "// 两个字段分开写：不冲突",
          STATE_CODE_DISTINCT,
        ].join("\n"),
      },
      {
        id: "nodes",
        title: "② 登记四个节点（addNode）",
        why: "takeOrder 是 fan-out 起点；branchHot / branchIce 是两个并行分支；serve 是 fan-in 汇合点。takeOrder / serve 节点函数签名不变；branchHot / branchIce 按 mode 写不同字段。",
        code: [
          TAKE_ORDER_CODE,
          "// 不写归约函数时两个分支都写 cupLabel：",
          BRANCH_HOT_NO_REDUCER_CODE,
          BRANCH_ICE_NO_REDUCER_CODE,
          "// array 归约时两个分支仍写 cupLabel：",
          BRANCH_HOT_ARRAY_CODE,
          BRANCH_ICE_ARRAY_CODE,
          "// 不同字段时两个分支写各自字段：",
          BRANCH_HOT_DISTINCT_CODE,
          BRANCH_ICE_DISTINCT_CODE,
          SERVE_CODE,
        ].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连 fan-out + fan-in 边（addEdge）",
        why: "takeOrder 出两条边到 branchHot / branchIce——这是 fan-out。branchHot / branchIce 各自 addEdge 到 serve——这是 fan-in。框架在同一个超级步里并行跑两个分支，跑完再进 serve。",
        code: PARALLEL_EDGES_CODE,
      },
      {
        id: "parallel",
        title: "④ 同一个超级步并行跑（不是串行）",
        why: "手写循环里这一步要么写 `Promise.all([branchHot, branchIce])` 显式并行，要么被你的 if/else 拍成串行。状态图里只要父节点出多条边，框架就同 super-step 并行；不需要你显式 await Promise.all。",
        code: `// 一次 stream chunk 里能拿到多个节点
for await (const chunk of graph.stream(input, { streamMode: "updates" })) {
  // chunk 形如 { branchHot: {...}, branchIce: {...} } —— 一个 chunk = 一个 super-step
  Object.keys(chunk).forEach(node => { /* patch 合并进 state */ });
}`,
      },
      {
        id: "compile",
        title: "⑤ 编译（compile）",
        why: "声明期到运行期的分界线。compile 时校验：节点名不重复、所有 fan-in 汇合点合法、所有节点能从 START 走到 END。",
        code: BUILD_CODE,
      },
    ],
    pathMap: [
      { key: "fan-out", toNode: "branchHot + branchIce", example: "takeOrder 完成 → 同 super-step 并行跑两台机器" },
      { key: "fan-in", toNode: "serve", example: "两台机器都跑完 → 汇合到出餐 → END" },
    ],
    nodeCodes: NODE_CODE_BY_NAME,
  };
}
