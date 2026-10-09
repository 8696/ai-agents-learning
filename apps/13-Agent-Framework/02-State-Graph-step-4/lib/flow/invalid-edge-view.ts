/**
 * 职责：把非法转移图的声明步骤、路径映射、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 边表文案 + 展示代码字面量（来自 invalid-edge-source.ts）→ DeclarationStep[] + pathMap。
 * 为什么单独成文件：跑图的主路径在 invalid-edge.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_INVALID_EDGE } from "./invalid-edge.js";
import {
  BUILD_CODE_INVALID_EDGE,
  CLASSIFY_CODE_INVALID_EDGE,
  INVALID_EDGES_CODE,
  NODE_CODE_BY_NAME_INVALID_EDGE,
  REJECT_CODE_INVALID_EDGE,
  ROUTE_CODE_FALLBACK,
  ROUTE_CODE_INVALID,
  ROUTE_CODE_NORMAL,
  STATE_CODE_INVALID_EDGE,
  TAKE_ORDER_CODE_INVALID_EDGE,
} from "./invalid-edge-source.js";

export type InvalidEdgeDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type InvalidEdgeGraphView = {
  drinkDefault: string;
  declaration: InvalidEdgeDeclarationStep[];
  pathMap: Array<{ key: string; toNode: string; example: string }>;
  nodeCodes: Record<string, string>;
};

export function describeInvalidEdgeGraph(): InvalidEdgeGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_INVALID_EDGE,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（多一格 drinkType）",
        why: "路由函数读 drinkType 决定下一站——这一格是「非法转移」教学的开关。",
        code: STATE_CODE_INVALID_EDGE,
      },
      {
        id: "nodes",
        title: "② 登记六个节点（addNode）",
        why: "点单 / 分类 / 热饮 / 冰饮 / 出餐 / 无法制作。节点函数签名不变。",
        code: [
          TAKE_ORDER_CODE_INVALID_EDGE,
          CLASSIFY_CODE_INVALID_EDGE,
          REJECT_CODE_INVALID_EDGE,
        ].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连条件边 + 收尾（addConditionalEdges + addEdge）",
        why: "classifyDrink 之后是 addConditionalEdges；正常路径 hot/ice/unknown 都进对应节点，unknown 进 reject；非法路径 pathMap 缺 unknown——路由函数返回未声明键，framework 抛「pathMap 里没有这个键」（接口级报错）。",
        code: INVALID_EDGES_CODE,
      },
      {
        id: "route",
        title: "④ 路由函数 + 路径映射（三个 mode）",
        why: "normal 直接返回 drinkType；invalid-edge 也直接返回，但 pathMap 缺 unknown → 抛异常；route-fallback 对未识别 drinkType 返回 reject，路径映射里有这一条 → 优雅走完。三种 mode 用同一份节点函数，差别只在 pathMap / 路由函数。",
        code: [
          "// normal：pathMap 完整",
          ROUTE_CODE_NORMAL,
          "",
          "// invalid-edge：pathMap 故意缺 unknown",
          ROUTE_CODE_INVALID,
          "",
          "// route-fallback：路由函数对未识别 drinkType 返回 reject",
          ROUTE_CODE_FALLBACK,
        ].join("\n"),
      },
      {
        id: "compile",
        title: "⑤ 编译（compile）",
        why: "声明期到运行期的分界线。compile 时校验：节点名不重复、addConditionalEdges 的 pathMap 键对应的 target 节点都存在、所有节点能从 START 走到 END。",
        code: BUILD_CODE_INVALID_EDGE,
      },
    ],
    pathMap: [
      { key: "hot", toNode: "brewHot", example: "「热拿铁」→ 走热饮机 → 出餐 → END（normal 模式）" },
      { key: "ice", toNode: "brewIce", example: "「冰美式」→ 走冰饮机 → 出餐 → END（normal 模式）" },
      { key: "unknown", toNode: "reject", example: "「来杯抹茶」→ 走进无法制作 → END（normal / route-fallback 模式；invalid-edge 模式 pathMap 没这一条 → 抛异常）" },
      { key: "reject", toNode: "reject", example: "route-fallback 模式专用：路由函数对未识别 drinkType 兜底返回 reject" },
    ],
    nodeCodes: NODE_CODE_BY_NAME_INVALID_EDGE,
  };
}
