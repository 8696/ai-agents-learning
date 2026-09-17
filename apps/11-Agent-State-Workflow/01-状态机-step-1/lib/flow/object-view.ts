/**
 * 职责：把一次「进图 / 走一步」编成七张对象卡片，每张带这杯咖啡订单的真实字段 + 伪代码。
 * 数据流：createOrder / stepOnce 把 State、转移、图传进来 → 页面点对象名直接渲染 data / code。
 * 为什么单独成文件：调度器负责跑图；本文件只负责「对着数据讲清对象是什么」。
 */
import {
  EDGES,
  NODE_PSEUDO,
  ROUTE_PSEUDO,
  SCHEDULER_PSEUDO,
  type CafeState,
  type NodeId,
  graphSnapshot,
  isNodeFailure,
  pickFields,
  stationOf,
} from "./cafe-graph.js";

export type TransitionView = {
  from: NodeId;
  to: NodeId;
  condition: string;
  read: Record<string, unknown>;
  wrote: Record<string, unknown>;
};

export type ObjectId =
  | "state"
  | "node"
  | "edge"
  | "route"
  | "transition"
  | "graph"
  | "scheduler";

export type ObjectCard = {
  id: ObjectId;
  label: string;
  what: string;
  data: unknown;
  code: string;
};

export type ObjectBoard = {
  objects: ObjectCard[];
  lastAction: "created" | "step";
  focusHint: ObjectId;
};

function nodeCode(id: NodeId): string {
  if (id === "okEnd" || id === "failEnd") {
    return "// 终止站没有节点函数，没有出边，调度器在这里停。";
  }
  return NODE_PSEUDO[id];
}

export function buildObjectBoard(input: {
  lastAction: "created" | "step";
  state: CafeState;
  before?: CafeState | null;
  transition?: TransitionView | null;
}): ObjectBoard {
  const { lastAction, state, before, transition } = input;
  const ranId: NodeId = transition ? transition.from : state.currentNode;
  const station = stationOf(
    ranId === "okEnd" ? "serve" : ranId === "failEnd" ? "takeOrder" : ranId,
  );
  const outEdges = EDGES.filter((row) => row.from === (transition ? transition.from : state.currentNode));
  const graph = graphSnapshot();

  const objects: ObjectCard[] = [
    {
      id: "state",
      label: "状态（State）",
      what: "这一杯咖啡现在知道的全部事实。当前节点只是其中一个字段。",
      data: state,
      code: "type CafeState = { currentNode, orderId, drinkName, drinkType, orderSlip, cupLabel, pickupCall, lastError, retryCount }",
    },
    {
      id: "node",
      label: "节点（Node）",
      what: lastAction === "created"
        ? "订单停在这一站，函数还没跑。点「走一步」才会读字段、写字段。"
        : "刚才跑完的这一站：只写业务字段，没有自己改 currentNode。",
      data:
        lastAction === "created"
          ? {
              当前站: state.currentNode,
              站名: stationOf(state.currentNode).label,
              将要读: pickFields(state, stationOf(state.currentNode).reads),
              将要写的字段名: stationOf(state.currentNode).writes,
            }
          : {
              刚跑的站: transition?.from,
              站名: station.label,
              读了: transition?.read,
              写了: transition?.wrote,
            },
      code: nodeCode(lastAction === "created" ? state.currentNode : ranId),
    },
    {
      id: "edge",
      label: "边（Edge）",
      what: lastAction === "created"
        ? "图上允许走的路。点单站现在有三条出边，走一步才会挑一条。"
        : "刚才走的那一条。没走的边还在边表里。",
      data: lastAction === "created"
        ? { 当前站出边: outEdges, 说明: "还没走。点单有三条出边：热饮制作 / 冰饮制作 / 无法制作。" }
        : {
            刚走的边: {
              from: transition?.from,
              to: transition?.to,
              condition: transition?.condition,
            },
            同一站没走的边: outEdges.filter((row) => row.to !== transition?.to),
            整张边表: EDGES,
          },
      code: "边表：takeOrder → brewHot（hot）| brewIced（iced）| failEnd（unknown）；制作站再汇合到出餐",
    },
    {
      id: "route",
      label: "条件路由（Conditional Routing）",
      what: "读 State 字段，从几条出边里挑一条。图没变，drinkType 变了，路径就变了。",
      data: lastAction === "created"
        ? {
            现在的当前节点: state.currentNode,
            点单的三条出边: outEdges.map((row) => ({ to: row.to, condition: row.condition })),
            说明: "走一步之后，点单会写出 drinkType，路由只读这个字段。",
          }
        : {
            刚才读到的当前节点: transition?.from,
            刚才读到的字段: { drinkType: state.drinkType, retryCount: state.retryCount, cupLabel: state.cupLabel, lastError: state.lastError },
            "函数 return": transition?.to,
            条件: transition?.condition,
            没走的边: EDGES.filter((row) => row.from === transition?.from && row.to !== transition?.to),
          },
      code: ROUTE_PSEUDO,
    },
    {
      id: "transition",
      label: "状态转移（State Transition）",
      what: "跑完一个节点之后：当前节点变了 + State 字段变了。这两件合在一起才叫一步。",
      data: lastAction === "created"
        ? {
            还没转移: true,
            说明: "下单只是进图。点「走一步」这里才会出现 from → to 和读/写差。",
          }
        : {
            from: transition?.from,
            to: transition?.to,
            读了: transition?.read,
            写了: transition?.wrote,
            转移前的当前节点: before?.currentNode,
            转移后的当前节点: state.currentNode,
          },
      code: "{ ...prev, ...patch, currentNode: next }",
    },
    {
      id: "graph",
      label: "图（Graph / Workflow）",
      what: "所有节点和边画在一起的交通图。热饮制作、冰饮制作、无法制作都在图上，走哪条由路由决定。",
      data: { 站点: graph.stations, 边: graph.edges, 这份订单当前站: state.currentNode },
      code: "开始 → 点单 → 制作 ↺（空结果且次数<3）→ 出餐 / 满 3 次失败终止",
    },
    {
      id: "scheduler",
      label: "调度器（Scheduler）",
      what: "真正执行「走一步」的那一层。节点不改当前站；由它问路由、验边、写下 currentNode。",
      data: lastAction === "created"
        ? {
            刚做的事: "进图（还没跑节点）",
            写下的当前节点: state.currentNode,
            还没跑的四行: ["① 跑节点", "② 问路由", "③ 验边", "④ 写下当前节点"],
          }
        : {
            刚跑过的四行: ["① 跑节点", "② 问路由", "③ 验边", "④ 写下当前节点"],
            第一行入参_当时的当前节点: before?.currentNode,
            第一行出参_节点写出的字段: transition?.wrote,
            "第二行路由读到的 drinkType": state.drinkType,
            "第二行路由读到的 retryCount": state.retryCount,
            "第二行路由读到的 lastError": state.lastError,
            "第二行路由 return": transition?.to,
            第三行验边: state.lastError && String(state.lastError).indexOf("非法转移") !== -1
              ? "拦住（下一站不在出边名单里）"
              : "通过（下一站在出边名单里）",
            第四行写下之后的当前节点: state.currentNode,
          },
      code: SCHEDULER_PSEUDO,
    },
  ];

  return {
    objects,
    lastAction,
    focusHint: lastAction === "created"
      ? "state"
      : (state.lastError && String(state.lastError).indexOf("非法转移") !== -1
        ? "scheduler"
        : (isNodeFailure(state.lastError)
          ? "route"
          : (transition?.from === transition?.to ? "route" : (transition?.from === "takeOrder" ? "route" : "transition")))),
  };
}
