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
