/**
 * 职责：共享页头 / 说明 / 页脚。默认口 fallback 50037。
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
          本页只演示：<strong>变体 4 · Tool 抛错结构化（调 LLM 协议 B）</strong>。
          3 个按钮演示 Tool 端内错的三端路径——全都在 <code className="text-gray-700 bg-gray-100 px-1 rounded">divide</code> Tool 上（数学人人都懂）：
          <br />· <strong>10 ÷ 2</strong> → 成功 · result=5
          <br />· <strong>10 ÷ 0</strong> → 业务错 · <code className="text-gray-700 bg-gray-100 px-1 rounded">code:"DIVIDE_BY_ZERO"</code> · <code className="text-gray-700 bg-gray-100 px-1 rounded">retryable:true</code>
          <br />· <strong>10 ÷ "abc"</strong> → 参数错 · <code className="text-gray-700 bg-gray-100 px-1 rounded">code:"INVALID_PARAM"</code> · <code className="text-gray-700 bg-gray-100 px-1 rounded">retryable:true</code>
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点上方 3 个按钮的任意一个</li>
          <li>POST /api/chat · 调 LLM 协议 B · 等 5 秒</li>
          <li>看「Round 1 + tool_result 结构化错误 + Round 2 + final_reply」完整两轮</li>
        </ol>
        <p className="text-xs text-gray-600 mt-2">
          <strong>核心教学点</strong>：handler throw 或 Zod 失败 → registry 中间件捕获 → 返 <code className="text-gray-700 bg-gray-100 px-1 rounded">{"{status:\"error\",code,message,retryable}"}</code> → <strong>不抛 HTTP 500</strong>，整轮 agent 不挂。Round 2 模型看到错误 → <strong>改输入重试</strong> → final_reply。
        </p>
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
    const port = (env && env.port) || 50037;
    let text = "端口 " + port + " · 加载中";
    if (err) text = "端口 " + port + " · /health 失败：" + err;
    else if (env) {
      text =
        "端口 " +
        port +
        " · 协议 B · provider " +
        (env.provider || "?") +
        " · model " +
        (env.model || "?") +
        " · Key " +
        (env.hasKey ? "✅" : "❌（主按钮 disabled）") +
        " · 工具 " +
        ((env.tools || []).map((t) => t.name).join("/"));
    }
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">{text}</span>
      </footer>
    );
  }

  window.DemoUI = { StatusPill, PageIntro, EnvFooter };
})();