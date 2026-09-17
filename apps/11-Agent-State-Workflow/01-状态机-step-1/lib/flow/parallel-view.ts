/**
 * 职责：把并行图的一次进图 / 走一步编成七张对象卡。
 * 数据流：createOrder / stepOnce 传入 State 和转移 → 页面点对象名看 data / 伪代码。
 * 为什么单独成文件：并行页的字段是 shotReady / milkReady，不要和带回边的咖啡店对象卡混用。
 */
import {
  EDGES,
  NODE_PSEUDO,
  PARALLEL_ARMS,
  ROUTE_PSEUDO,
  SCHEDULER_PSEUDO,
  type NodeId,
  type ParallelState,
  graphSnapshot,
} from "./parallel-graph.js";

export type TransitionView = {
  from: NodeId;
  to: NodeId;
  condition: string;
  read: Record<string, unknown>;
  wrote: Record<string, unknown>;
};

export type ObjectId = "state" | "node" | "edge" | "route" | "transition" | "graph" | "scheduler";

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

export function buildParallelBoard(input: {
  lastAction: "created" | "step";
  state: ParallelState;
  before?: ParallelState | null;
  transition?: TransitionView | null;
}): ObjectBoard {
  const { lastAction, state, before, transition } = input;
  const from = transition ? transition.from : state.currentNode;
  const outEdges = EDGES.filter((row) => row.from === from);
  const graph = graphSnapshot();
  const objects: ObjectCard[] = [
    {
      id: "state",
      label: "状态（State）",
      what: "这一杯现在知道的全部事实。shotReady / milkReady 是两只并行臂各自写回的字段。",
      data: state,
      code: "type ParallelState = { currentNode, shotReady, milkReady, mergeMode, ... }",
    },
    {
      id: "node",
      label: "节点（Node）",
      what: lastAction === "created"
        ? "还没跑站。分流站会一次跑出浓缩和打奶两个节点函数。"
        : (from === "fork"
          ? "这一步同时跑了两个节点：出浓缩只写 shotReady，打奶只写 milkReady。"
          : "刚跑完的这一站只写自己的业务字段。"),
      data: lastAction === "created"
        ? { 还没跑: true, 即将同时跑: PARALLEL_ARMS }
        : {
            刚跑的站: from,
            同时跑的臂: from === "fork" ? PARALLEL_ARMS : [],
            写了: transition?.wrote,
          },
      code: from === "fork" ? NODE_PSEUDO.brewShot + "\n\n" + NODE_PSEUDO.steamMilk : (NODE_PSEUDO[from] || "// 终止站"),
    },
    {
      id: "edge",
      label: "边（Edge）",
      what: "图上允许走的路。分流站画出两条同时出发的臂，汇合边要求两个字段都在。",
      data: {
        当前站出边: outEdges,
        并行臂: PARALLEL_ARMS,
        整张边表: EDGES,
      },
      code: "fork ──∥── 出浓缩 / 打奶 → 两边都写回才 assemble",
    },
    {
      id: "route",
      label: "条件路由（Conditional Routing）",
      what: "分流之后读 shotReady 和 milkReady：都有值去组装，缺一个进失败终止。",
      data: lastAction === "created"
        ? { 现在的当前节点: state.currentNode, 说明: "走一步到分流后，才会同时跑两臂。" }
        : {
            刚才读到的字段: { shotReady: state.shotReady, milkReady: state.milkReady, mergeMode: state.mergeMode },
            "函数 return": transition?.to,
            条件: transition?.condition,
          },
      code: ROUTE_PSEUDO,
    },
    {
      id: "transition",
      label: "状态转移（State Transition）",
      what: "分流站的一步 = 两臂都跑完 + 合并补丁 + 当前节点改到汇合或失败。",
      data: lastAction === "created"
        ? { 还没转移: true }
        : {
            from: transition?.from,
            to: transition?.to,
            读了: transition?.read,
            写了: transition?.wrote,
            转移前: before?.currentNode,
            转移后: state.currentNode,
          },
      code: "{ ...prev, ...shotPatch, ...milkPatch, currentNode: next }",
    },
    {
      id: "graph",
      label: "图（Graph / Workflow）",
      what: "点单 → 分流（浓缩 ∥ 打奶）→ 组装。点单必须先于打奶，因为打奶要读订单条。",
      data: { 站点: graph.stations, 边: graph.edges, 并行臂: graph.parallelArms, 当前站: state.currentNode },
      code: "takeOrder → fork ──∥── brewShot / steamMilk → assemble → okEnd",
    },
    {
      id: "scheduler",
      label: "调度器（Scheduler）",
      what: "分流站不是只跑一个节点。它跑两臂、合并补丁、再验边、写下 currentNode。",
      data: lastAction === "created"
        ? { 刚做的事: "进图", 写下的当前节点: state.currentNode }
        : {
            合并方式: state.mergeMode === "own" ? "只合并自己改的字段" : "两臂都 return 整份旧对象，后写的盖掉先写的",
            "合并后 shotReady": state.shotReady,
            "合并后 milkReady": state.milkReady,
            下一站: state.currentNode,
          },
      code: SCHEDULER_PSEUDO,
    },
  ];
  return {
    objects,
    lastAction,
    focusHint: lastAction === "created"
      ? "graph"
      : (from === "fork" ? "scheduler" : "transition"),
  };
}
