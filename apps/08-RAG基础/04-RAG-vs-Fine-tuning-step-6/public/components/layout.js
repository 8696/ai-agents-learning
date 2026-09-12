// 职责：页脚 EnvFooter —— 页面加载时拉一次 /health，把端口 / 提供商 / 模型 / 密钥 状态渲到页脚。
// 数据流：fetch("/health") → setInfo → <span id="env-info">。
// 挂到 window.DemoUI；多页共用。
const { useEffect, useState } = React;

function EnvFooter() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    fetch("/health")
      .then(r => r.json())
      .then(setInfo)
      .catch(() => setInfo({ port: "—", provider: null, model: null, hasKey: false }));
  }, []);
  if (!info) {
    return <span id="env-info">端口 50085 · 协议 A（openai Chat Completions）· 加载中…</span>;
  }
  const providerLabel =
    info.provider === "minimax" ? "MiniMax"
    : info.provider === "zhipu" ? "智谱"
    : info.provider === "deepseek" ? "DeepSeek"
    : info.provider === "qwen" ? "千问"
    : info.provider === "custom" ? "自定义"
    : "（未配置）";
  return (
    <span id="env-info">
      端口 {info.port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {info.model ?? "—"} · 密钥 {info.hasKey ? "✅" : "❌（apps/.env 未配置当前模型服务商的 Key）"}
    </span>
  );
}

window.DemoUI = window.DemoUI || {};
window.DemoUI.EnvFooter = EnvFooter;