/**
 * 职责：共享页头/说明/页脚组件（挂 window.DemoUI）。
 * 数据流：GET /health → EnvFooter；StatusPill 四态；PageIntro 写本页教学点。
 * 默认口 fallback：50031（与 runtime-ctx / yarn PORT= 一致）。
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
          本页只演示：同一套 tools + 同一句 query，只改{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">tool_choice</code>
          （auto / none / required），看模型会不会产出 tool_calls。跑过的三档结果会留在下方对照，不会互相覆盖。
          <span className="text-red-700"> required 却无 tool_calls、或 none 仍有 tool_calls → 标红「Provider 违约」</span>
          ；thinking 模型上点 required 若网关 400 → 琥珀色「thinking × 强制 Choice 冲突」（变体 6）。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>选一档 Choice → 点「跑这一档」→ POST /api/choice（body 带 query + toolChoice）</li>
          <li>服务端把固定 tools + 你选的 tool_choice 发给协议 A；本步不执行 Tool，只看模型响应</li>
          <li>结果写入该档位卡片；对照 hasToolCalls，并看协议判定条是否标红</li>
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
        .then((j) => setEnv(j))
        .catch((e) => setErr(String(e)));
    }, []);

    const port = (env && env.port) || 50031;
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
