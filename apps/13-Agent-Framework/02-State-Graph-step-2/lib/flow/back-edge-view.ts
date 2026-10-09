/**
 * 职责：把回边图的声明步骤、路径映射、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 边表文案 + 展示代码字面量（来自 back-edge-source.ts）→ DeclarationStep[] + pathMap。
 * 为什么单独成文件：跑图的主路径在 back-edge.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_BACK_EDGE } from "./back-edge.js";
import {
  BACK_EDGE_EDGES_CODE,
  BREW_HOT_CODE_BACK_EDGE,
  BUILD_CODE_BACK_EDGE,
  NODE_CODE_BY_NAME_BACK_EDGE,
  REJECT_CODE_BACK_EDGE,
  ROUTE_CODE_BACK_EDGE,
  SERVE_CODE_BACK_EDGE,
  STATE_CODE_BACK_EDGE,
  TAKE_ORDER_CODE_BACK_EDGE,
} from "./back-edge-source.js";

export type BackEdgeDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type BackEdgeGraphView = {
  drinkDefault: string;
  declaration: BackEdgeDeclarationStep[];
  pathMap: Array<{ key: string; toNode: string; example: string }>;
  nodeCodes: Record<string, string>;
};

export function describeBackEdgeGraph(): BackEdgeGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_BACK_EDGE,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（多一格 retryCount）",
        why: "路由函数读 retryCount 决定下一站——空杯还能重做几次。retryCount 在 brewHot 节点里 +1，不靠外部 while。",
        code: STATE_CODE_BACK_EDGE,
      },
      {
        id: "nodes",
        title: "② 登记四个节点（addNode）",
        why: "点单 / 重做 brewHot / 出餐 / 无法制作。brewHot 节点的 cupLabel 由 mode + retryCount 决定是否出杯；其它节点函数签名不变（仍然只 return 自己改的字段）。",
        code: [
          TAKE_ORDER_CODE_BACK_EDGE,
          BREW_HOT_CODE_BACK_EDGE,
          SERVE_CODE_BACK_EDGE,
          REJECT_CODE_BACK_EDGE,
        ].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连回边 + 收尾（addConditionalEdges + addEdge）",
        why: "brewHot 之后是 addConditionalEdges；retry → brewHot（自己）是回边；success → serve → END；exceeded → reject → END。回边靠状态字段收敛，靠递归上限兜底。",
        code: BACK_EDGE_EDGES_CODE,
      },
      {
        id: "route",
        title: "④ 路由函数 + 路径映射",
        why: "路由函数读 cupLabel 和 retryCount，返回 success / retry / exceeded；路径映射把键翻成目标节点名。retry → brewHot 是回边，brewHot 自己又被指回 brewHot 自己——这就是回边合法的样子。",
        code: ROUTE_CODE_BACK_EDGE,
      },
      {
        id: "compile",
        title: "⑤ 编译（compile）",
        why: "声明期到运行期的分界线。compile 时校验：节点名不重复、边指向存在的节点、所有节点能从 START 走到 END。",
        code: BUILD_CODE_BACK_EDGE,
      },
    ],
    pathMap: [
      { key: "success", toNode: "serve", example: "「smooth」第 1 次就出杯 → 出餐 → END" },
      { key: "retry", toNode: "brewHot", example: "「retry-once」第 1 次空杯、回 brewHot；「fail」每次都空杯都回 brewHot" },
      { key: "exceeded", toNode: "reject", example: "「fail」第 3 次仍空杯 → reject → END" },
    ],
    nodeCodes: NODE_CODE_BY_NAME_BACK_EDGE,
  };
}
