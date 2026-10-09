/**
 * 职责：把递归上限图的声明步骤、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 展示代码字面量（来自 recursion-graph-source.ts）→ DeclarationStep[]。
 * 为什么单独成文件：跑图的主路径在 recursion-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_RECURSION, DEFAULT_RECURSION_LIMIT } from "./recursion-graph.js";
import {
  COMPILE_RECUSION_LIMIT,
  GRACEFUL_TRY_CATCH,
  MODULE_07_DIFF,
  NODE_CODE_BY_NAME_RECURSION,
  PATH_MAP_RECURSION,
  ROUTE_BROKEN,
  ROUTE_WELL_BEHAVED,
  STATE_CODE_RECURSION,
} from "./recursion-graph-source.js";

export type RecursionDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type RecursionGraphView = {
  drinkDefault: string;
  recursionLimitDefault: number;
  declaration: RecursionDeclarationStep[];
  nodeCodes: Record<string, string>;
};

export function describeRecursionGraph(): RecursionGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_RECURSION,
    recursionLimitDefault: DEFAULT_RECURSION_LIMIT,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（多 stoppedReason / recursionLimit）",
        why: "stoppedReason 用来体面收场（区别于模块 07 的同名字段）；recursionLimit 是 compile 入参，不进状态。",
        code: STATE_CODE_RECURSION,
      },
      {
        id: "nodes",
        title: "② 登记三个节点（addNode）",
        why: "点单 / brewHot（重做站）/ 出餐。brewHot 每跑一次 retryCount +1、cupLabel 仍 null——模拟机器一直做坏，路由函数才能看出上限写没写。",
        code: [
          NODE_CODE_BY_NAME_RECURSION.takeOrder,
          NODE_CODE_BY_NAME_RECURSION.brewHot,
          NODE_CODE_BY_NAME_RECURSION.serve,
        ].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连边（addEdge + addConditionalEdges）",
        why: "START → takeOrder → brewHot；brewHot 出条件边（路由函数返回 \"retry\" → brewHot，\"ok\" → serve）。retry → 自己 = 回边。",
        code: `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "brewHot")
.addConditionalEdges("brewHot", routeAfterBrew, { retry: "brewHot", ok: "serve" })
.addEdge("serve", END)`,
      },
      {
        id: "route",
        title: "④ 三个 mode 路由函数对比（教学点）",
        why: "well-behaved 看了 cupLabel 和 retryCount 上限；always-broken / graceful 只看 cupLabel——**忘写 retryCount < 3**。这就是变体 H 的根因：路由写错或漏写上限 → recursionLimit 兜底 → 超了就抛 GraphRecursionError。",
        code: [
          "// 路由函数 1：well-behaved（正确）",
          ROUTE_WELL_BEHAVED,
          "",
          "// 路由函数 2：always-broken / graceful（忘了写上限）",
          ROUTE_BROKEN,
        ].join("\n"),
      },
      {
        id: "pathMap",
        title: "⑤ 路径映射",
        why: "路由返回 \"retry\" → 回到 brewHot；\"ok\" → serve。",
        code: PATH_MAP_RECURSION,
      },
      {
        id: "compile",
        title: "⑥ compile() + stream({ recursionLimit })（关键）",
        why: "langgraph 1.x 里 compile() 不接受 recursionLimit——它只接受 checkpointer / interruptBefore/After / name / description / transformers。recursionLimit 在 stream / invoke 调用里以运行时配置传入，**默认是 25**。",
        code: COMPILE_RECUSION_LIMIT,
      },
      {
        id: "graceful",
        title: "⑦ 外层 try/catch（graceful 模式独有）",
        why: "graceful 模式和 always-broken 用的**是同一张图**（同样写错的路由）。差别只在 invoke 外层用 try/catch 捕获 GraphRecursionError → 写 stoppedReason: \"recursion_limit\" → 200 返回。模块 07 也是这个模式：超 maxRounds 不是抛，是写 stoppedReason = \"max_rounds\"。",
        code: GRACEFUL_TRY_CATCH,
      },
      {
        id: "module07",
        title: "⑧ 跟模块 07 maxRounds 的差别（计量单位 + 收场方式）",
        why: "**超级步 ≠ 模型轮次**。模块 07 的 maxRounds 数的是「模型调了几轮」，状态图的 recursionLimit 数的是「走了几个超级步」——一个超级步里有多个并行节点、可能不调模型。收场方式也不同：模块 07 写 stoppedReason；状态图默认抛异常，要体面得自己 catch。",
        code: MODULE_07_DIFF,
      },
    ],
    nodeCodes: NODE_CODE_BY_NAME_RECURSION,
  };
}