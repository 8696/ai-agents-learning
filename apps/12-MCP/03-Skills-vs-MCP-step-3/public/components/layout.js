/**
 * 职责：页头状态徽标 + 页脚环境信息。对应协议里的整页壳，不画出杯轨迹。
 * 颜色：待连接灰 / 请求中蓝 / 完成绿 / 错误红。
 */
(function () {
  function StatusPill(props) {
    const tone = props.tone;
    const cls =
      tone === "loading" ? "bg-blue-100 text-blue-800" :
      tone === "ok" ? "bg-green-100 text-green-800" :
      tone === "err" ? "bg-red-100 text-red-800" :
      "bg-gray-200 text-gray-700";
    const text =
      tone === "loading" ? "🔄 请求中" :
      tone === "ok" ? "✅ 完成" :
      tone === "err" ? "❌ 错误" :
      "⏸ 待连接";
    return <span id="status-pill" className={"text-xs px-2 py-1 rounded " + cls}>{text}</span>;
  }

  function EnvFooter(props) {
    const env = props.env;
    const port = (env && env.port) || 50138;
    const provider = env && env.provider ? env.provider : "（待连接）";
    const model = env && env.model ? env.model : "（待连接）";
    const keyText = env
      ? (env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥；本步不调大模型，主按钮不禁用）")
      : "密钥 （待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 本地计算 · 不调大模型 · 模型服务商 {provider} · 模型 {model} · {keyText}
        </span>
      </footer>
    );
  }

  window.DemoUI = Object.assign(window.DemoUI || {}, {
    StatusPill: StatusPill,
    EnvFooter: EnvFooter,
  });
})();
