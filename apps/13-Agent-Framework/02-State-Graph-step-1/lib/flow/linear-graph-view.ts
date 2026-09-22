/**
 * 职责：把线性图的声明步骤和源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 边表文案 + 展示代码字面量（来自 linear-graph-source.ts）→ DeclarationStep[]。
 * 为什么单独成文件：跑图的主路径在 linear-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import {
  DEFAULT_DRINK,
} from "./linear-graph.js";
import {
  BREW_HOT_CODE,
  BUILD_CODE,
  NODE_CODE_BY_NAME,
  SERVE_CODE,
  STATE_CODE,
  TAKE_ORDER_CODE,
} from "./linear-graph-source.js";

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
  nodeCodes: Record<string, string>;
};

export function describeLinearGraph(): LinearGraphView {
  return {
    drinkDefault: DEFAULT_DRINK,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（State Annotation）",
        why: "告诉框架这份状态有哪些字段、每个字段被更新时怎么合并。手写版没有这一层。",
        code: STATE_CODE,
      },
      {
        id: "nodes",
        title: "② 登记三个节点（addNode）",
        why: "节点函数签名和模块 11 一模一样：吃状态，只返回自己改的字段。step-1 故意把每个节点内部升级成 await 一个本地 async 工具（模拟真实业务里调远程服务的延迟与回包），以后换真 HTTP 只改 URL。",
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
        why: "声明期和运行期的分界线。compile 把链式声明收成可运行对象，并做静态检查。",
        code: BUILD_CODE,
      },
      {
        id: "run",
        title: "⑤ 运行（stream · 模式 updates）",
        why: "stream 每走完一个超级步吐一份「哪个节点写了什么」。线性图里一个超级步 = 一站。",
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
    nodeCodes: NODE_CODE_BY_NAME,
  };
}