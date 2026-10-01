/**
 * 职责：把条件分流图的声明步骤、路径映射、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 边表文案 + 展示代码字面量（来自 conditional-graph-source.ts）→ DeclarationStep[] + pathMap。
 * 为什么单独成文件：跑图的主路径在 conditional-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_CONDITIONAL } from "./conditional-graph.js";
import {
  BREW_HOT_CODE_CONDITIONAL,
  BREW_ICE_CODE,
  BUILD_CODE_CONDITIONAL,
  CLASSIFY_CODE,
  CONDITIONAL_EDGES_CODE,
  NODE_CODE_BY_NAME_CONDITIONAL,
  REJECT_CODE,
  ROUTE_CODE,
  SERVE_CODE_CONDITIONAL,
  STATE_CODE_CONDITIONAL,
  TAKE_ORDER_CODE_CONDITIONAL,
} from "./conditional-graph-source.js";

export type ConditionalDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type ConditionalGraphView = {
  drinkDefault: string;
  declaration: ConditionalDeclarationStep[];
  pathMap: Array<{ key: string; toNode: string; example: string }>;
  nodeCodes: Record<string, string>;
};

export function describeConditionalGraph(): ConditionalGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_CONDITIONAL,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（多一格 drinkType）",
        why: "路由函数读 drinkType 决定下一站；这一格是条件分流能跑起来的关键。其它字段和线性图一样。",
        code: STATE_CODE_CONDITIONAL,
      },
      {
        id: "nodes",
        title: "② 登记六个节点（addNode）",
        why: "点单 / 分类 / 热饮 / 冰饮 / 出餐 / 无法制作。节点函数签名不变，仍然只 return 自己改的字段（手写版那一套规则不变）。",
        code: [
          TAKE_ORDER_CODE_CONDITIONAL,
          CLASSIFY_CODE,
          BREW_HOT_CODE_CONDITIONAL,
          BREW_ICE_CODE,
          SERVE_CODE_CONDITIONAL,
          REJECT_CODE,
        ].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连条件边 + 三条固定尾巴（addConditionalEdges + addEdge）",
        why: "classifyDrink 之后是 addConditionalEdges；brewHot / brewIce 各自再 addEdge 回到 serve → END；reject 直接 addEdge(END)，不经过 serve。",
        code: CONDITIONAL_EDGES_CODE,
      },
      {
        id: "route",
        title: "④ 路由函数 + 路径映射",
        why: "路由函数返回键；路径映射把键翻成目标节点名。手写 pickRoute 里「边表里找不到就抛错」那一半，在这里是「路径映射里没这个键，运行时报错」（接口级报错，不是业务级拦截）。",
        code: ROUTE_CODE,
      },
      {
        id: "compile",
        title: "⑤ 编译（compile）",
        why: "声明期到运行期的分界线。compile 时校验：节点名不重复、边指向存在的节点、所有节点能从 START 走到 END。",
        code: BUILD_CODE_CONDITIONAL,
      },
    ],
    pathMap: [
      { key: "hot", toNode: "brewHot", example: "「中杯热拿铁」→ 走热饮机 → 出餐 → END" },
      { key: "ice", toNode: "brewIce", example: "「大杯冰美式」→ 走冰饮机 → 出餐 → END" },
      { key: "unknown", toNode: "reject", example: "「来杯抹茶」→ 菜单没有 → 直接 END（不经过 serve）" },
    ],
    nodeCodes: NODE_CODE_BY_NAME_CONDITIONAL,
  };
}
