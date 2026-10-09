/**
 * 职责：装配带递归上限的状态图（变体 H）。
 *
 * 形状：START → takeOrder → brewHot →（路由）→ brewHot / serve → END
 *
 * 三个 mode 控制路由函数：
 *   well-behaved   路由看 cupLabel === null && retryCount < 3 → 收敛
 *   always-broken  路由只看 cupLabel === null（**忘写上限**） → 框架抛 GraphRecursionError
 *   graceful       同 always-broken（外层 invoke 用 try/catch 体面收场）
 *
 * 数据流：drinkName + mode + recursionLimit → buildRecursionGraph → graph.stream(...)
 *       → 累加 runtime；抛 GraphRecursionError 时按 mode 决定冒出去还是体面返回。
 *
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { notifyPickup, placeOrder } from "../tools/cafe-tools.js";
import { logger } from "../logger.js";

export const DEFAULT_DRINK_RECURSION = "来一杯中杯热拿铁。";
export const DEFAULT_RECURSION_LIMIT = 10;

export type RecursionMode = "well-behaved" | "always-broken" | "graceful";

export type StoppedReason = "ok" | "recursion_limit" | null;

export type RecursionState = {
  drinkName: string;
  mode: RecursionMode;
  recursionLimit: number;
  orderSlip: string | null;
  cupLabel: string | null;
  retryCount: number;
  stoppedReason: StoppedReason;
  pickupCall: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const RecursionStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode: Annotation<RecursionMode>({ reducer: lastWrite, default: () => "well-behaved" as RecursionMode }),
  recursionLimit: Annotation<number>({ reducer: lastWrite, default: () => DEFAULT_RECURSION_LIMIT }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount: Annotation<number>({ reducer: lastWrite, default: () => 0 }),
  stoppedReason: Annotation<StoppedReason>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: RecursionState): Promise<Partial<RecursionState>> {
  const t0 = Date.now();
  const order = await placeOrder({ drinkName: state.drinkName });
  logger.info("takeOrderNode", "返回节点 patch：orderSlip", "下单工具 await 返回订单条", {
    入参: { drinkName: state.drinkName },
    __code: "return { orderSlip: order.orderSlip };",
    返回值: { orderSlip: order.orderSlip },
    耗时ms: Date.now() - t0,
  });
  return { orderSlip: order.orderSlip };
}

export async function brewHotNode(state: RecursionState): Promise<Partial<RecursionState>> {
  const t0 = Date.now();
  // 模拟「机器永远做坏」：cupLabel 一直 null；retryCount 每跑一次 +1。
  const nextCount = (state.retryCount ?? 0) + 1;
  const patch = { retryCount: nextCount, cupLabel: null };
  logger.info("brewHotNode", "返回节点 patch：retryCount++，cupLabel 仍 null", "模拟机器一直做坏；路由要看 cupLabel 决定是否重做", {
    入参: { retryCount: state.retryCount, cupLabel: state.cupLabel },
    __code: "const nextCount = (state.retryCount ?? 0) + 1; return { retryCount: nextCount, cupLabel: null };",
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

export async function serveNode(state: RecursionState): Promise<Partial<RecursionState>> {
  const t0 = Date.now();
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  logger.info("serveNode", "返回节点 patch：pickupCall", "出餐广播工具 await 返回广播文案", {
    入参: { orderSlip: state.orderSlip, cupLabel: state.cupLabel },
    __code: "return { pickupCall: notify.pickupCall };",
    返回值: { pickupCall: notify.pickupCall },
    耗时ms: Date.now() - t0,
  });
  return { pickupCall: notify.pickupCall };
}

/**
 * 三个 mode 的路由函数对比：
 *   - well-behaved  │ 看了 cupLabel && retryCount 上限 → 收敛
 *   - always-broken │ 只看 cupLabel，**忘写 retryCount 上限** → 死循环 → 抛错
 *   - graceful      │ 同 always-broken，外层 try/catch 兜底
 */
export function routeAfterBrew(state: RecursionState): "retry" | "ok" {
  if (state.mode === "well-behaved") {
    if (state.cupLabel === null && (state.retryCount ?? 0) < 3) return "retry";
    return "ok";
  }
  // always-broken 与 graceful：路由函数忘记写 retryCount < 3 上限
  if (state.cupLabel === null) return "retry";
  return "ok";
}

const NODE_LABELS: Record<string, string> = {
  takeOrder: "点单",
  brewHot: "热饮制作（重做站）",
  serve: "出餐",
};

export type RecursionRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<RecursionState>;
  stateAfter: RecursionState;
};

export type RecursionInvokeResult = {
  status: "completed" | "recursion_limit";
  stoppedReason: StoppedReason;
  finalState: RecursionState;
  runtime: RecursionRuntimeStep[];
  mode: RecursionMode;
  recursionLimit: number;
  /** always-broken 抛错时，errorMessage 给前端展示抛错文案；其它 mode 不写 */
  errorMessage?: string;
};

export function buildRecursionGraph() {
  // 注：recursionLimit 在这个 langgraph 版本下是 stream/invoke 的运行时配置，不是 compile 入参。
  // 这里只 compile 出图；recursionLimit 在 invokeRecursionGraph 的 stream 调用里传。
  logger.info("buildRecursionGraph", "调用函数：buildRecursionGraph", "装配状态图；recursionLimit 在 invoke 时传", {
    __code: "compile() // 无入参；recursionLimit 在 stream 调用时传",
  });
  return new StateGraph(RecursionStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("brewHot", brewHotNode)
    .addNode("serve", serveNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "brewHot")
    .addConditionalEdges(
      "brewHot",
      routeAfterBrew,
      { retry: "brewHot", ok: "serve" },
    )
    .addEdge("serve", END)
    .compile();
}

function makeInitial(input: { drinkName: string; mode: RecursionMode; recursionLimit: number }): RecursionState {
  return {
    drinkName: input.drinkName,
    mode: input.mode,
    recursionLimit: input.recursionLimit,
    orderSlip: null,
    cupLabel: null,
    retryCount: 0,
    stoppedReason: null,
    pickupCall: null,
  };
}

function isGraphRecursionError(e: unknown): boolean {
  // LangGraph 抛 GraphRecursionError；类名长这样：name === "GraphRecursionError"。
  // 兜底：消息里含 "Recursion limit" 字符串也算。
  if (e instanceof Error) {
    if (e.name === "GraphRecursionError") return true;
    if (e.message.includes("Recursion limit")) return true;
  }
  return false;
}

/**
 * 跑一遍图。stream 模式一边跑一边累加 runtime；
 * 抛 GraphRecursionError 时按 mode 决定：always-broken 让它冒出去，graceful 体面收场。
 */
export async function invokeRecursionGraph(input: {
  drinkName: string;
  mode: RecursionMode;
  recursionLimit: number;
}): Promise<RecursionInvokeResult> {
  const t0 = Date.now();
  const { drinkName, mode, recursionLimit } = input;
  const runtime: RecursionRuntimeStep[] = [];
  let merged: RecursionState = makeInitial(input);
  const graph = buildRecursionGraph();

  logger.info("invokeRecursionGraph", "开始 invoke", "stream 模式跑图；recursionLimit 作为 stream 配置传入；抛错时 runtime 仍保留跑过的站", {
    入参: input,
  });

  try {
    const stream = await graph.stream(
      { drinkName, mode } as RecursionState,
      { streamMode: "updates", recursionLimit },
    );
    for await (const chunk of stream) {
      const keys = Object.keys(chunk);
      for (const node of keys) {
        const patch = (chunk as Record<string, Partial<RecursionState>>)[node] ?? {};
        merged = { ...merged, ...patch };
        const label = NODE_LABELS[node] ?? node;
        runtime.push({ node, label, patch, stateAfter: { ...merged } });
      }
    }
    logger.info("invokeRecursionGraph", "结束：completed（正常到 END）", "整张图跑完，进 END", {
      返回值: { runtimeLength: runtime.length, finalState: merged },
      耗时ms: Date.now() - t0,
    });
    return {
      status: "completed",
      stoppedReason: "ok",
      finalState: { ...merged, stoppedReason: "ok" },
      runtime,
      mode,
      recursionLimit,
    };
  } catch (e) {
    if (!isGraphRecursionError(e)) {
      logger.error("invokeRecursionGraph", "结束：异常（非 GraphRecursionError）", "非递归上限异常照常抛", {
        错误: e instanceof Error ? { name: e.name, message: e.message } : String(e),
        耗时ms: Date.now() - t0,
      });
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    logger.warn("invokeRecursionGraph", "GraphRecursionError 触发", "图跑满递归上限；按 mode 决定是冒出去还是体面收场", {
      入参: { mode, recursionLimit, retryCount: merged.retryCount, runtimeLength: runtime.length },
      错误文案: message,
    });

    if (mode === "always-broken") {
      // 让 route 层捕获 → 返 500
      throw e;
    }
    if (mode === "well-behaved") {
      // well-behaved 不应该 catch——它本来就在限内能收敛。捕到说明是另一种异常，冒出去。
      logger.error("invokeRecursionGraph", "结束：well-behaved 抛了 GraphRecursionError", "unexpected——路由应该收敛，超限意味着路由 / compile 函数有错", {
        错误文案: message,
        耗时ms: Date.now() - t0,
      });
      throw e;
    }

    // graceful 模式：体面收场 → 200
    const finalState: RecursionState = { ...merged, stoppedReason: "recursion_limit" };
    logger.info("invokeRecursionGraph", "结束：recursion_limit（graceful 体面收场）", "外层 try/catch 把异常变成完成态", {
      返回值: { status: "recursion_limit", finalState, runtimeLength: runtime.length, errorMessage: message },
      耗时ms: Date.now() - t0,
    });
    return {
      status: "recursion_limit",
      stoppedReason: "recursion_limit",
      finalState,
      runtime,
      mode,
      recursionLimit,
      errorMessage: message,
    };
  }
}