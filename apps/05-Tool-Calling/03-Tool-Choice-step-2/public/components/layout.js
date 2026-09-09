/**
 * 职责：共享页头/说明/页脚（挂 window.DemoUI）。
 * 默认口 fallback：50032。
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
          本页只演示：<strong>required（任选 ≥1）≠ 指定某一个 Tool</strong>。
          同时注册 <code className="text-xs bg-gray-100 px-1 rounded">query_logistics</code> 与{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">get_weather</code>；
          同 query 下跑「required / 钉死物流 / 钉死天气」，三档结果常驻对照。
          钉死档应 <strong>name 恒等于</strong> 指定名；required 只保证有 call，不保证是哪一个。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>选档位 →「跑这一档」→ POST /api/force</li>
          <li>服务端发协议 A：required 字符串，或指定函数的 object（type=function + name）</li>
          <li>看 firstToolName 是否被钉死；thinking 模型上强制可能 400（琥珀色教学卡）</li>
        </ol>
        {/* 核心教学点卡片（§5.3.11.b 强制） */}
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">tool_choice 的两个写法语义完全不同:① 「required」字符串 = 强制必须调工具但**不指定哪个**(模型在多个 Tool 之间自选);② 用 function 类型 object 带 name 字段(object 形式) = 强制**钉死**具体工具名。required 只保证有 call,不保证是哪一个;钉死档 firstToolName 必须恒等于指定名。这是「强制自由度 vs 强制钉死」的根本区分。</div>
          <div className="text-xs text-gray-600">怎么观察:同时注册 query_logistics + get_weather 两个 Tool,跑三档:① required → firstToolName 是 query_logistics 或 get_weather(模型自选);② 钉死物流 → firstToolName 必须恒等于 query_logistics;③ 钉死天气 → 必须恒等于 get_weather。三档对照看「强制自由度」vs「强制钉死」怎么 work。</div>
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
    const port = (env && env.port) || 50032;
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
