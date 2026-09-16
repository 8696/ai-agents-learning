/**
 * 职责：8-A 投毒判定结果展示卡。
 * 数据流：接 detectPoisoning 返回的 { category, isPoisoned, reason, modelRequest, modelResponse } →
 * 顶部 PASSED / BLOCKED 徽标 + category 翻译 + reason 解释 + 完整 modelRequest/Response 两栏 JSON。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const CATEGORY_LABEL = {
    safe: { label: "safe（普通事实）", cls: "bg-green-100 text-green-900" },
    rule_change: { label: "rule_change（想改 Agent 行为规则）", cls: "bg-red-100 text-red-900" },
    instruction_injection: { label: "instruction_injection（想注入新指令到系统提示词）", cls: "bg-red-100 text-red-900" },
    role_override: { label: "role_override（想覆盖 Agent 角色）", cls: "bg-red-100 text-red-900" },
    pii_collect: { label: "pii_collect（想套出 / 记录别人隐私）", cls: "bg-red-100 text-red-900" },
  };

  DemoUI.PoisonResultCard = function PoisonResultCard(props) {
    const r = props.result;
    if (!r) return null;
    const cat = CATEGORY_LABEL[r.category] || { label: r.category, cls: "bg-gray-100 text-gray-900" };
    const blocked = r.isPoisoned;
    return (
      <section className={"bg-white shadow rounded p-4 space-y-3 border-l-4 " + (blocked ? "border-red-500" : "border-green-500")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={"text-xs px-2 py-0.5 rounded font-semibold " + (blocked ? "bg-red-600 text-white" : "bg-green-600 text-white")}>
            {blocked ? "🚫 投毒拦下（BLOCKED）" : "✅ 安全放行（PASSED）"}
          </span>
          <span className={"text-xs px-2 py-0.5 rounded font-semibold " + cat.cls}>{cat.label}</span>
          <span className="text-xs text-gray-500">isPoisoned = {String(r.isPoisoned)}</span>
        </div>

        <div className="bg-gray-50 border rounded p-2">
          <div className="text-xs font-semibold text-gray-700 mb-1">拦下 / 放行理由（reason）</div>
          <div className="text-sm text-gray-800">{r.reason}</div>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700 font-semibold">📤 完整 modelRequest（发给大模型的 4 个键：model / messages / temperature / response_format）</summary>
          <pre className="mt-2 text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-2 max-h-72 overflow-auto">{JSON.stringify(r.modelRequest, null, 2)}</pre>
        </details>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700 font-semibold">📥 完整 modelResponse（大模型返回的完整 response）</summary>
          <pre className="mt-2 text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-2 max-h-72 overflow-auto">{JSON.stringify(r.modelResponse, null, 2)}</pre>
        </details>
      </section>
    );
  };
})();
