/**
 * 职责：把线性图的声明步骤和源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 边表文案 → DeclarationStep[]。
 * 为什么单独成文件：跑图的主路径在 linear-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 */
import { logger } from "../logger.js";
import {
  BREW_HOT_CODE,
  BUILD_CODE,
  DEFAULT_DRINK,
  SERVE_CODE,
  STATE_CODE,
  TAKE_ORDER_CODE,
} from "./linear-graph.js";

export type DeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type LinearGraphView = {
  drinkDefault: string;
  declaration: DeclarationStep[];
  edges: Array<{ from: string; to: string; why: string }>;
};

export function describeLinearGraph(): LinearGraphView {
  const t0 = Date.now();
  logger.info(
    "调用函数-describeLinearGraph",
    "调用函数开始：describeLinearGraph",
    "为什么写这条日志：页面加载时先看见声明步骤和源代码，还没跑图。当前：只读装配说明。",
    { 入参: {}, __code: describeLinearGraph.toString() },
  );
  const 返回值: LinearGraphView = {
    drinkDefault: DEFAULT_DRINK,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（State Annotation）",
        why: "告诉框架这份状态有哪些字段、每个字段被更新时怎么合并。手写版你没有这一层，就是一个类型 + 对象展开。step-1 每个字段只有一个节点写，归约函数还看不出并行冲突。",
        code: STATE_CODE,
      },
      {
        id: "nodes",
        title: "② 登记三个节点（addNode）",
        why: "节点函数签名和模块 11 一模一样：吃状态，只返回自己改的字段。业务函数不用重写，换的是谁在喊「下一步做什么」。",
        code: [TAKE_ORDER_CODE, BREW_HOT_CODE, SERVE_CODE].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连四条固定边（addEdge）",
        why: "START → 点单 → 热饮制作 → 出餐 → END。没有条件边，没有回边。这就是线性图：路已经画死，运行时不再问 if。",
        code: `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "brewHot")
.addEdge("brewHot", "serve")
.addEdge("serve", END)`,
      },
      {
        id: "compile",
        title: "④ 编译（compile）",
        why: "声明期和运行期的分界线。compile 把链式声明收成可运行对象，并做静态检查（边指向不存在的节点会在这里炸）。一行业务都还没跑。",
        code: BUILD_CODE,
      },
      {
        id: "run",
        title: "⑤ 运行（stream · 模式 updates）",
        why: "stream 每走完一个超级步吐一份「哪个节点写了什么」。线性图里一个超级步 = 一站。这就是模块 11 stepOnce 被框架收走之后，你还能看见每一站的办法。",
        code: `const stream = await graph.stream({ drinkName }, { streamMode: "updates" });
for await (const chunk of stream) {
  // chunk 形如 { takeOrder: { orderSlip: "…" } }
}`,
      },
    ],
    edges: [
      { from: "START", to: "takeOrder", why: "图从这里进。START 是框架给的入口，不是你自己的业务站。" },
      { from: "takeOrder", to: "brewHot", why: "点单写完订单条，无条件去热饮机。step-1 不分流。" },
      { from: "brewHot", to: "serve", why: "杯盖写好，无条件去出餐。" },
      { from: "serve", to: "END", why: "取餐广播写好，图停。END 对应你手写的 okEnd，框架不分成功 / 失败两个终止站。" },
    ],
  };
  logger.info(
    "调用函数-describeLinearGraph",
    "调用函数结束：describeLinearGraph",
    "为什么写这条日志：页面要用这份说明把声明流程摊开。当前：还没 compile、还没跑。",
    { 返回值, 耗时ms: Date.now() - t0 },
  );
  return 返回值;
}
