/**
 * 职责：状态条 + 页脚环境信息。挂 window.DemoUI。
 * 数据流：status / health → StatusPill / EnvFooter（#status-pill #env-info）
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function StatusPill(props) {
    const status = props.status;
    let text = "⏸ 待连接";
    let cls = "text-xs px-2 py-1 rounded bg-gray-200";
    if (status === "loading") {
      text = "🔄 请求中";
      cls = "text-xs px-2 py-1 rounded bg-yellow-200";
    } else if (status === "ok") {
      text = "✅ 完成";
      cls = "text-xs px-2 py-1 rounded bg-green-200";
    } else if (status === "err") {
      text = "❌ 错误";
      cls = "text-xs px-2 py-1 rounded bg-red-200";
    }
    return <span id="status-pill" className={cls}>{text}</span>;
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50132;
    const provider = env && env.provider ? env.provider : "（待连接）";
    const model = env && env.model ? env.model : "（待连接）";
    const keyLabel = env ? (env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥）") : "密钥 （待连接）";
    return (
      <span id="env-info">
        端口 {port} · 本地 JSON-RPC 形状演示 · 不调大模型 · 模型服务商 {provider} · 模型 {model} · {keyLabel}
      </span>
    );
  }

  DemoUI.StatusPill = StatusPill;
  DemoUI.EnvFooter = EnvFooter;
  window.DemoUI = DemoUI;
})();
