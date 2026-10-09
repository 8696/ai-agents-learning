/**
 * 职责：把主子图页的声明步骤、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 展示代码字面量（来自 parent-graph-source.ts）→ DeclarationStep[]。
 * 为什么单独成文件：跑图的主路径在 parent-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_PARENT } from "./parent-graph.js";
import {
  EDGES_PARENT,
  EDGES_SUBGRAPH,
  MAKE_DRINK_FLAT_CODE,
  MAKE_DRINK_SUBGRAPH_RENAMED,
  MAKE_DRINK_SUBGRAPH_SAME,
  SERVE_CODE_PARENT,
  STATE_CODE_PARENT,
  SUBGRAPH_BREW_HOT_NODE,
  SUBGRAPH_STATE_RENAMED,
  SUBGRAPH_STATE_SAME,
  TAKE_ORDER_CODE_PARENT,
  WHEN_TO_SUBGRAPH,
} from "./parent-graph-source.js";

export type ParentDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type ParentGraphView = {
  drinkDefault: string;
  declaration: ParentDeclarationStep[];
  nodeCodes: Record<string, string>;
  makeDrinkCodes: { flat: string; "subgraph-same-fields": string; "subgraph-renamed": string };
  subgraphStateCodes: { "subgraph-same-fields": string; "subgraph-renamed": string };
};

export function describeParentGraph(): ParentGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_PARENT,
    declaration: [
      {
        id: "state",
        title: "① 父图状态标注（mode 字段控制 makeDrink 装什么）",
        why: "父图加一个 mode 字段——flat / subgraph-same-fields / subgraph-renamed。运行时按 mode 决定 makeDrink 装什么：普通节点 / 同名字段子图 / 不同名字段 wrapper。",
        code: STATE_CODE_PARENT,
      },
      {
        id: "subgraph-state-same",
        title: "② 子图 A 状态标注（同名字段）",
        why: "orderSlip / cupLabel / retryCount 三个字段名和父图**完全一样**。父图 addNode(\"makeDrink\", subA) 时同名自动传。",
        code: SUBGRAPH_STATE_SAME,
      },
      {
        id: "subgraph-state-renamed",
        title: "③ 子图 B 状态标注（不同名字段）",
        why: "drinkSlip / label / retries——父图字段名是 orderSlip / cupLabel / retryCount，对不上。父图必须写 wrapper 翻译。",
        code: SUBGRAPH_STATE_RENAMED,
      },
      {
        id: "nodes",
        title: "④ 父图三节点（takeOrder / makeDrink / serve）",
        why: "takeOrder 和 serve 在三种 mode 下都一样；只有 makeDrink 按 mode 切换。makeDrink 这一站 = 父图的整张子图（或等价 flat 节点）。",
        code: [
          TAKE_ORDER_CODE_PARENT,
          "—— makeDrink 三 mode 见下面 ⑤ / ⑥ / ⑦ ——",
          SERVE_CODE_PARENT,
        ].join("\n\n"),
      },
      {
        id: "make-drink-flat",
        title: "⑤ makeDrink · flat 模式（不抽子图）",
        why: "普通节点函数。和子图内 brewHot 完全等价——只是写在主图自己的代码里。**单图就够用就别抽子图**（判断口诀见 ⑨）。",
        code: MAKE_DRINK_FLAT_CODE,
      },
      {
        id: "make-drink-same",
        title: "⑥ makeDrink · subgraph-same-fields（同名自动传）",
        why: "**关键一行**：`parentGraph.addNode(\"makeDrink\", subgraphSame)`。父图直接把编译好的子图作为节点挂上。同名字段自动传——无需 wrapper。",
        code: MAKE_DRINK_SUBGRAPH_SAME,
      },
      {
        id: "make-drink-renamed",
        title: "⑦ makeDrink · subgraph-renamed（不同名走 wrapper）",
        why: "父图挂的不是子图本身，是 wrapper 节点函数。wrapper 手动 invoke 子图并翻译字段：orderSlip → drinkSlip；label → cupLabel；retries → retryCount。",
        code: MAKE_DRINK_SUBGRAPH_RENAMED,
      },
      {
        id: "subgraph-edges",
        title: "⑧ 子图边（makeDrink 内部）",
        why: "子图自己也有 START / END——和父图的 START / END 是两套不同节点名。父图 → makeDrink 触发子图 START；子图 END → 父图 makeDrink 完成 → 走 serve。",
        code: EDGES_SUBGRAPH,
      },
      {
        id: "parent-edges",
        title: "⑨ 父图边（START → makeDrink → END）",
        why: "父图边本身不变——不管 makeDrink 装的是普通节点还是子图，边的指向都是 \"makeDrink\"。",
        code: EDGES_PARENT,
      },
      {
        id: "subgraph-brew",
        title: "⑩ 子图内 brewHot（两 mode 共用逻辑）",
        why: "子图 A 和 B 跑的都是 brewHot 这一站——只是状态字段名不同（cupLabel vs label）。",
        code: SUBGRAPH_BREW_HOT_NODE,
      },
      {
        id: "when-to-subgraph",
        title: "⑪ 什么时候才值得抽子图（判断口诀）",
        why: "**能用一张 flat 图画清的就别抽子图**。子图的价值在「复用」和「边界」，不在「嵌套」。变体 J「店几点关门」就是反例——根本不该上图，更别说上子图。",
        code: WHEN_TO_SUBGRAPH,
      },
    ],
    nodeCodes: {
      takeOrder: TAKE_ORDER_CODE_PARENT,
      makeDrink: MAKE_DRINK_FLAT_CODE,
      serve: SERVE_CODE_PARENT,
    },
    makeDrinkCodes: {
      flat: MAKE_DRINK_FLAT_CODE,
      "subgraph-same-fields": MAKE_DRINK_SUBGRAPH_SAME,
      "subgraph-renamed": MAKE_DRINK_SUBGRAPH_RENAMED,
    },
    subgraphStateCodes: {
      "subgraph-same-fields": SUBGRAPH_STATE_SAME,
      "subgraph-renamed": SUBGRAPH_STATE_RENAMED,
    },
  };
}