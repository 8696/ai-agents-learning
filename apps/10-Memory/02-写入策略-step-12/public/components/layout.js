/**
 * 职责：页头状态、教学说明（含本页核心教学点卡片）、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // StatusPill 四态：⏸待连接 / 🔄请求中 / ✅完成 / ❌错误。
  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  };

  // EnvFooter：端口 fallback 50115；本步调大模型做「会话摘要 + 画像合并」（POST /api/compress mode=session + mode=image）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50115;
    const hasKey = Boolean(env.hasKey);
    const providerLabel = env.provider ? String(env.provider) : "（待连接）";
    const modelLabel = env.model ? String(env.model) : "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {modelLabel} · 密钥{" "}
          {hasKey ? "✅" : "❌（apps/.env 未配置该家密钥）"} · 本步调大模型做「会话摘要 + 画像合并」
        </span>
      </footer>
    );
  };
})();
