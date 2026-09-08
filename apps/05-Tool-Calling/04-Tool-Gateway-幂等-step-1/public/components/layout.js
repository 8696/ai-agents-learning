/**
 * 职责：共享页头 / 说明 / 页脚。默认口 fallback 50034。
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
          本页只演示：<strong>Tool Gateway 三钩子 + 协议 B 真 LLM</strong>（变体 1）。
          模型读你的 query → 决定要不要调 <code className="bg-gray-100 px-1 rounded">delete_user</code>（永久删用户 · 不可逆） →
          Tool handler 内部按顺序走 <strong>① 鉴权（admin role）② 配额（每月 5 次）③ 危险（必须 confirm_token）</strong> →
          任一不过直接拒绝，全过才伪执行。**模型发出 tool_use ≠ 允许执行**——这就是 Gateway 的意义。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>填 query（让模型想调 delete_user）+ actor role（user → 鉴权失败）+ confirm_token（不填 → NEEDS_CONFIRM）</li>
          <li>点「调模型发请求」 → POST /api/chat（协议 B · Anthropic Messages API）</li>
          <li>输出区看：Round 1/2 四张数据卡 + 钩子判定链 + 拒绝/通过/二次确认 三态</li>
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
    const port = (env && env.port) || 50034;
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
        " · 钩子 " +
        ((env.gatewayHooks || []).join("/")) +
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