/**
 * 职责：点七个核心对象名，展示这杯咖啡订单的真实 data + 伪代码。
 * 数据流：App 传入 objectBoard 和当前选中 id；没订单时用空态文案，图/路由/调度器仍能看见伪代码。
 * 为什么单独成文件：对象解剖是「七个对象」页的主界面，不堆进吧台。
 */
window.DemoUI = window.DemoUI || {};

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

const EMPTY_CARDS = [
  {
    id: "state",
    label: "状态（State）",
    what: "这一杯咖啡现在知道的全部事实。下单之后，这里会出现这份 JSON。",
    data: { 还没有订单: true, 下单后会出现: ["orderId", "currentNode", "drinkName", "drinkType", "orderSlip", "cupLabel", "pickupCall", "lastError", "retryCount"] },
    code: "type CafeState = { currentNode, orderId, drinkName, drinkType, orderSlip, cupLabel, pickupCall, lastError, retryCount }",
  },
  {
    id: "node",
    label: "节点（Node）",
    what: "图上的一个站点，到了就干活。点单会写出 drinkType，给路由用。",
    data: { 还没有订单: true },
    code: "function takeOrder(state) {\n  return classifyDrink(state.drinkName);\n}",
  },
  {
    id: "edge",
    label: "边（Edge）",
    what: "图上允许走的路。点单现在有三条出边，跟有没有订单无关。",
    data: {
      整张边表: [
        { from: "takeOrder", to: "brewHot", condition: "drinkType === hot" },
        { from: "takeOrder", to: "brewIced", condition: "drinkType === iced" },
        { from: "takeOrder", to: "failEnd", condition: "drinkType === unknown" },
        { from: "brewHot", to: "serve", condition: "cupLabel 有值" },
        { from: "brewHot", to: "failEnd", condition: "lastError 是热饮机故障" },
        { from: "brewHot", to: "brewHot", condition: "杯盖空、未故障、retryCount < 3" },
        { from: "brewHot", to: "failEnd", condition: "杯盖空且 retryCount >= 3" },
        { from: "serve", to: "okEnd", condition: "无条件" },
      ],
    },
    code: "边表：制作站 → 自己（回边）| serve | failEnd",
  },
  {
    id: "route",
    label: "条件路由（Conditional Routing）",
    what: "读 drinkType 分流；读 retryCount 决定制作站要不要回到自己。",
    data: { 读什么: "lastError / drinkType / retryCount", 节点失败: "lastError 是热饮机故障则立刻 failEnd", 回边: "retryCount < 3 则 return 同一制作站", 满次: "return failEnd" },
    code: "function route(currentNode, state) {\n  if (currentNode === \"brewHot\") {\n    if (isNodeFailure(state.lastError)) return \"failEnd\";\n    if (state.cupLabel) return \"serve\";\n    if (state.retryCount < 3) return \"brewHot\";\n    return \"failEnd\";\n  }\n}",
  },
  {
    id: "transition",
    label: "状态转移（State Transition）",
    what: "跑完一个节点之后：当前节点变了 + State 字段变了。点「走一步」才会出现 from → to。",
    data: { 还没走一步: true },
    code: "{ ...prev, ...patch, currentNode: next }",
  },
  {
    id: "graph",
    label: "图（Graph / Workflow）",
    what: "所有节点和边画在一起的交通图。制作站有一条回到自己的边。",
    data: {
      站点: [
        { id: "takeOrder", label: "点单", reads: ["drinkName"], writes: ["orderSlip", "drinkType", "lastError"] },
        { id: "brewHot", label: "热饮制作", reads: ["orderSlip", "drinkName", "retryCount"], writes: ["cupLabel", "retryCount", "lastError"] },
        { id: "brewIced", label: "冰饮制作", reads: ["orderSlip", "drinkName", "retryCount"], writes: ["cupLabel", "retryCount", "lastError"] },
        { id: "serve", label: "出餐", reads: ["orderSlip", "cupLabel"], writes: ["pickupCall"] },
        { id: "okEnd", label: "完成", reads: ["pickupCall"], writes: [] },
        { id: "failEnd", label: "无法制作", reads: ["lastError"], writes: [] },
      ],
      边: [
        { from: "takeOrder", to: "brewHot", condition: "drinkType === hot" },
        { from: "takeOrder", to: "brewIced", condition: "drinkType === iced" },
        { from: "takeOrder", to: "failEnd", condition: "drinkType === unknown" },
        { from: "brewHot", to: "serve", condition: "cupLabel 有值" },
        { from: "brewHot", to: "failEnd", condition: "lastError 是热饮机故障" },
        { from: "brewHot", to: "brewHot", condition: "杯盖空、未故障、retryCount < 3" },
        { from: "brewHot", to: "failEnd", condition: "杯盖空且 retryCount >= 3" },
        { from: "brewIced", to: "serve", condition: "cupLabel 有值" },
        { from: "brewIced", to: "failEnd", condition: "lastError 是热饮机故障" },
        { from: "brewIced", to: "brewIced", condition: "杯盖空、未故障、retryCount < 3" },
        { from: "brewIced", to: "failEnd", condition: "杯盖空且 retryCount >= 3" },
        { from: "serve", to: "okEnd", condition: "无条件" },
      ],
    },
    code: "开始 → 点单 → 制作 ↺ → 出餐 / 满 3 次失败终止",
  },
  {
    id: "scheduler",
    label: "调度器（Scheduler）",
    what: "真正执行「走一步」的那一层。② 问路由时要带上节点刚写出的 drinkType。",
    data: { 还没跑: ["① 跑节点", "② 问路由", "③ 验边", "④ 写下当前节点"] },
    code: "function step(state) {\n  ① const patch = nodes[state.currentNode](state);\n  ② const next = route(state.currentNode, { ...state, ...patch });\n  ③ 验边\n  ④ return { ...state, ...patch, currentNode: next };\n}",
  },
];

function ObjectBoard(props) {
  const board = props.board;
  const selectedId = props.selectedId;
  const onSelect = props.onSelect;
  const hasTicket = Boolean(board && board.objects && board.objects.length);
  const cards = hasTicket ? board.objects : EMPTY_CARDS;
  const selected = cards.filter(function (card) { return card.id === selectedId; })[0] || cards[5];

  return (
    <section className="bg-white shadow rounded p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-gray-900">点一个对象，看这份订单里它是什么</div>
        <p className="text-xs text-gray-500 mt-1">
          七个按钮就是七个核心对象。下单后点对象名，走一步再看字段怎么变。被拦住时点「调度器」，第三行验边应是拦住。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {cards.map(function (card) {
          const on = card.id === selectedId;
          const cls = on
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-800 border-gray-300";
          return (
            <button
              key={card.id}
              type="button"
              className={"text-xs px-2 py-1 rounded border " + cls}
              onClick={function () { onSelect(card.id); }}
            >
              {card.label}
            </button>
          );
        })}
      </div>
      {!hasTicket ? (
        <div className="text-xs text-gray-500">
          现在还没有订单：「图 / 边 / 条件路由」已经有数据。下单后，「状态 / 节点」才会带上这份订单的字段。
        </div>
      ) : null}
      {selected ? (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="border border-gray-200 rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-800">{selected.label} · 这份订单里的数据</div>
            <p className="text-xs text-gray-600">{selected.what}</p>
            <pre className="whitespace-pre-wrap text-xs bg-gray-50 text-gray-700 p-2 rounded max-h-56 overflow-auto">
              {pretty(selected.data)}
            </pre>
          </div>
          <div className="border border-gray-200 rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-800">伪代码</div>
            <pre className="whitespace-pre-wrap text-xs bg-gray-50 text-gray-700 p-2 rounded max-h-56 overflow-auto">
              {selected.code}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}

window.DemoUI.ObjectBoard = ObjectBoard;
