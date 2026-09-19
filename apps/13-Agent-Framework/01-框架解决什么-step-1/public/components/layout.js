/**
 * 职责：各页共用的说明区、状态徽标、页脚环境信息。
 * 数据流：PageIntro 吃教学文案；StatusPill 吃四态；EnvFooter 加载 GET /health 填端口 / 模型服务商 / 模型 / 密钥。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.StatusPill = function StatusPill(props) {
    const status = props.status || "idle";
    const map = {
      idle: { cls: "bg-gray-200 text-gray-700", text: "⏸ 待连接" },
      loading: { cls: "bg-blue-100 text-blue-800", text: "🔄 请求中" },
      ok: { cls: "bg-green-100 text-green-800", text: "✅ 完成" },
      error: { cls: "bg-red-100 text-red-800", text: "❌ 错误" },
    };
    const item = map[status] || map.idle;
    return <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>{item.text}</span>;
  };

  DemoUI.PageIntro = function PageIntro(props) {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">本页只演示：<b>{props.lead}</b></p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          {(props.steps || []).map(function (step, i) {
            return <li key={i}>{step}</li>;
          })}
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">{props.takeaway}</div>
          <div className="text-xs text-gray-600">{props.observe}</div>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50139;
    const provider = env.provider || "（待连接）";
    const model = env.model || "（待连接）";
    const keyText = env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {provider} · 模型 {model} · {keyText}
        </span>
      </footer>
    );
  };
})();
