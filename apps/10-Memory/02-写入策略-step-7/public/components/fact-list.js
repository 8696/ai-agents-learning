/**
 * 职责：事实库清单组件——把 GET /api/facts 返回的 facts 渲染成可读卡片列表。
 * 数据流：kvList 返回值 { facts: Record<string, 业务 value>, count } → 逐条渲染。
 *
 * 业务 value 形态（写入 kv 时存的）：
 * { value: string, type: string, confidence: number, source: string, validUntil: string | null, text: string }
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const TYPE_STYLE = {
    "语义记忆": { badge: "bg-blue-100 text-blue-800" },
    "情景记忆": { badge: "bg-purple-100 text-purple-800" },
  };

  // 单条事实卡片。
  DemoUI.FactCard = function FactCard(props) {
    // 注意：业务 key prop 改名 keyName ——React 的 props.key 是保留 prop（在调和阶段被过滤），
    // 业务代码不能再叫 key，否则页面所有卡片显示的 key 都是 undefined。
    const factKey = props.keyName;
    // 兼容两种 value 形态：
    //   ① 业务对象 { value, type, confidence, source, validUntil, text }（新数据，路由 dedup.ts 包装）
    //   ② 裸字符串（旧数据，直接 kvSet 写入的简化版）
    // —— 兼容 ① + ② 保证页面永远能看到 value 字段，不至于只显示 key。
    const raw = props.value;
    const isObject = raw !== null && raw !== undefined && typeof raw === "object";
    const v = isObject ? raw : {};
    const valueText = isObject ? (v.value ?? "（无 value）") : (raw ?? "（无 value）");
    const hasMeta = isObject;
    const typeStyle = TYPE_STYLE[v.type] || { badge: "bg-gray-100 text-gray-800" };
    return (
      <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className={"text-xs px-2 py-0.5 rounded font-medium " + typeStyle.badge}>
              {hasMeta ? (v.type || "（无类型）") : "（简化版裸字符串）"}
            </span>
            <span className="text-xs text-gray-700">
              置信度（confidence）：<b>{hasMeta && typeof v.confidence === "number" ? v.confidence.toFixed(2) : "（无）"}</b>
            </span>
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-900">已入库</span>
        </div>
        <p className="text-sm font-semibold text-gray-900">{valueText}</p>
        <p className="text-xs text-gray-600">键（key）：<code className="bg-gray-100 px-1 rounded">{factKey}</code></p>
        {hasMeta ? (
          <>
            <p className="text-xs text-gray-600">来源（source）：{v.source || "（无）"}</p>
            <p className="text-xs text-gray-600">
              有效期（validUntil）：{v.validUntil ? v.validUntil : "永久有效（没有失效时间线索）"}
            </p>
            {v.text ? (
              <p className="text-xs text-gray-500 italic">来自原文：{v.text}</p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-gray-500 italic">元数据：这条是简化版写入（没 type / confidence / source 等元数据）——新写入会自动带完整元数据。</p>
        )}
      </div>
    );
  };

  // 事实库清单列表。
  DemoUI.FactList = function FactList(props) {
    const facts = props.facts || {};
    const count = props.count != null ? props.count : Object.keys(facts).length;
    if (count === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          事实库里还没有任何事实——在「提取并把关」区选中档候选点 [记住]，就会写入这里。
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-600">
          事实库已有 <b>{count}</b> 条：
        </p>
        {Object.keys(facts).map(function (key) {
          return <DemoUI.FactCard key={key} keyName={key} value={facts[key]} />;
        })}
      </div>
    );
  };

  // 顶部「事实库已有 N 条」徽标。
  DemoUI.FactCountBadge = function FactCountBadge(props) {
    const count = props.count != null ? props.count : 0;
    return (
      <div className="border border-gray-200 bg-white rounded p-2 text-xs text-gray-700 inline-flex items-center gap-2">
        <span>事实库已有</span>
        <span className="text-sm font-semibold text-green-700">{count}</span>
        <span>条</span>
        <button
          type="button"
          className="ml-2 text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100"
          onClick={props.onShow}
        >
          {props.open ? "收起事实库" : "查看事实库"}
        </button>
      </div>
    );
  };
})();