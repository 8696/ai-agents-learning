/**
 * 职责：页头状态条、页脚环境信息。
 * 数据流：App 传入 status / env；页脚 fallback 端口 50122，真值来自 GET /health。
 * 为什么单独成文件：骨架两块每页都要；各页说明在 page-intro.js。
 */
window.DemoUI = window.DemoUI || {};

function StatusPill(props) {
  const map = {
    idle: { cls: "bg-gray-200 text-gray-700", text: "⏸ 待连接" },
    loading: { cls: "bg-blue-100 text-blue-800", text: "🔄 请求中" },
    ok: { cls: "bg-green-100 text-green-800", text: "✅ 完成" },
    error: { cls: "bg-red-100 text-red-800", text: "❌ 错误" },
  };
  const view = map[props.status] || map.idle;
  return (
    <span id="status-pill" className={"text-xs px-2 py-1 rounded " + view.cls}>
      {view.text}
    </span>
  );
}

function EnvFooter(props) {
  const env = props.env;
  const port = (env && env.port) || 50122;
  let text = "端口 " + port + " · 本地计算 · 不调大模型（LLM） · （待连接）";
  if (env) {
    const keyText = env.hasKey
      ? "密钥 ✅"
      : "密钥 ❌（apps/.env 未配置该家密钥）";
    text =
      "端口 " +
      port +
      " · 本地计算 · 不调大模型（LLM） · 模型服务商 " +
      (env.provider || "—") +
      " · 模型 " +
      (env.model || "—") +
      " · " +
      keyText;
  }
  return (
    <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
      <span id="env-info">{text}</span>
    </footer>
  );
}

window.DemoUI.StatusPill = StatusPill;
window.DemoUI.EnvFooter = EnvFooter;
