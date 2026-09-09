/**
 * 职责：共享页头/说明/页脚。默认口 fallback 50033。
 */
(function () {
  const { useState, useEffect } = React;

  function StatusPill({ status }) {
    const map = {
      idle: { text: "⏸ 待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄 请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅ 完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌ 错误", cls: "bg-red-100 text-red-800" },
    };
    const s = map[status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + s.cls}>
        {s.text}
      </span>
    );
  }

  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<strong>用户点的是产品开关，后端改的是 tool_choice 字段</strong>
          （变体 5）。三档开关「只聊天 / 允许工具 / 强制查库」分别映射到{" "}
          <code className="text-xs bg-gray-100 px-1">none</code> /{" "}
          <code className="text-xs bg-gray-100 px-1">auto</code> /{" "}
          <code className="text-xs bg-gray-100 px-1">required</code>。
          用户口头说「帮我查」≠ 已设 required——必须改请求字段。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点产品开关 → 页面展示「映射到哪」</li>
          <li>跑这一档 → POST /api/switch（body: switchId + query）</li>
          <li>请求卡片里核对 tool_choice；三档结果常驻对照</li>
        </ol>
        {/* 核心教学点卡片（§5.3.11.b 强制） */}
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">产品开关 ≠ tool_choice 字段——用户在 UI 上点「强制查库」必须由后端把请求的 tool_choice 改成 `required`,而不是相信用户口头说「帮我查」就会触发调工具。这是「产品需求 → 协议字段」的映射层,前端 UI 只是一个开关,真正的硬约束在后端的请求构造里。</div>
          <div className="text-xs text-gray-600">怎么观察:三档产品开关「只聊天 / 允许工具 / 强制查库」分别映射到 `none` / `auto` / `required`:① 点「只聊天」开关看请求卡片里 tool_choice="none";② 「允许工具」=auto 模型自决;③ 「强制查库」=required 强制调——必须在请求字段层硬改,不是只在 UI 上加文字。请求卡片对照看 mapping 表。</div>
        </div>
      </section>
    );
  }

  function EnvFooter() {
    const [env, setEnv] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
      fetch("/health")
        .then((r) => r.json())
        .then(setEnv)
        .catch((e) => setErr(String(e)));
    }, []);
    const port = (env && env.port) || 50033;
    let text = "端口 " + port + " · 协议 A · provider (待连接) · model (待连接) · Key (待连接)";
    if (err) text = "端口 " + port + " · /health 失败：" + err;
    else if (env) {
      text =
        "端口 " +
        port +
        " · 协议 A · provider " +
        (env.provider || "(无)") +
        " · model " +
        (env.model || "(无)") +
        " · Key " +
        (env.hasKey ? "✅" : "❌（apps/.env 未配置该家 Key）");
    }
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">{text}</span>
      </footer>
    );
  }

  window.DemoUI = { StatusPill, PageIntro, EnvFooter };
})();
