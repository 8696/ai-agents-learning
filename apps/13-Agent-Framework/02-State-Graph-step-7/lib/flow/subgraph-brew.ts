/**
 * 职责：装配两张子图（变体 I · 子图）。
 *
 * 子图 A：buildSubgraphBrewSameFields
 *   状态字段 = orderSlip / cupLabel / retryCount（与父图同名）
 *   父图 addNode("makeDrink", subA) → 同名字段自动传
 *
 * 子图 B：buildSubgraphBrewRenamed
 *   状态字段 = drinkSlip / label / retries（与父图不同名）
 *   父图 addNode("makeDrink", wrapper) → wrapper 手动翻译字段
 *
 * 为什么单独成文件：本文件只服务子图装配；父图装配在 parent-graph.ts。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

export const SUBGRAPH_DEMO_LABEL = "热杯（子图内 brewHot 写出「{slip}」";

// 子图 A：同名字段（与父图同名 = orderSlip / cupLabel / retryCount）
const SubgraphSameAnnotation = Annotation.Root({
  orderSlip: Annotation<string>({ reducer: (_l, r) => r, default: () => "" }),
  cupLabel: Annotation<string | null>({ reducer: (_l, r) => r, default: () => null }),
  retryCount: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),
});

export async function subgraphBrewHotSameNode(state: { orderSlip: string; retryCount: number }): Promise<{ cupLabel: string | null; retryCount: number }> {
  const nextCount = (state.retryCount ?? 0) + 1;
  const cupLabel = SUBGRAPH_DEMO_LABEL.replace("{slip}", state.orderSlip ?? "");
  return { retryCount: nextCount, cupLabel };
}

export function buildSubgraphBrewSameFields() {
  return new StateGraph(SubgraphSameAnnotation)
    .addNode("subBrewHot", subgraphBrewHotSameNode)
    .addEdge(START, "subBrewHot")
    .addEdge("subBrewHot", END)
    .compile();
}

// 子图 B：不同名字段（drinkSlip / label / retries）
const SubgraphRenamedAnnotation = Annotation.Root({
  drinkSlip: Annotation<string>({ reducer: (_l, r) => r, default: () => "" }),
  label: Annotation<string | null>({ reducer: (_l, r) => r, default: () => null }),
  retries: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),
});

export async function subgraphBrewHotRenamedNode(state: { drinkSlip: string; retries: number }): Promise<{ label: string | null; retries: number }> {
  const nextCount = (state.retries ?? 0) + 1;
  const label = SUBGRAPH_DEMO_LABEL.replace("{slip}", state.drinkSlip ?? "");
  return { retries: nextCount, label };
}

export function buildSubgraphBrewRenamed() {
  return new StateGraph(SubgraphRenamedAnnotation)
    .addNode("subBrewHot", subgraphBrewHotRenamedNode)
    .addEdge(START, "subBrewHot")
    .addEdge("subBrewHot", END)
    .compile();
}