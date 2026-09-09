/**
 * 职责：共享页头 / 说明 / 页脚。默认口 fallback 50036。
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
          本页只演示：<strong>变体 3 · read_recent_emails 委托授权（调 LLM 协议 B）</strong>。
          模型读 query → → 决定调 <code className="bg-gray-100 px-1 rounded">read_recent_emails</code> → handler 三步：
          <br />· ① fail-closed：<code className="bg-gray-100 px-1 rounded">actor.userId === "platform-god"</code> 一律拒
          <br />· ② 鉴权：<code className="bg-gray-100 px-1 rounded">oauth_tokens[userId]</code> 不存在拒
          <br />· ③ 用该用户自己的 token 调" Gmail API"（mock）→ 返 per-user 邮件
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>选 actor userId（alice / bob / platform-god / carol）</li>
          <li>点「调模型发请求」 → POST /api/chat（<strong>真调 LLM 协议 B</strong>）</li>
          <li>输出区看：Round 1/2 数据卡 + read_recent_emails 结果（per-user 邮件 / fail-closed / 未 OAuth）</li>
        </ol>
        {/* 核心教学点卡片（§5.3.11.b 强制） */}
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">委托授权(Delegated Authorization)的三步防御:① fail-closed(`actor.userId === "platform-god"` 一律拒,防止超管账号被模型滥用);② 鉴权(`oauth_tokens[userId]` 不存在拒);③ 用**该用户自己的** token 调 Gmail API(mock)→ per-user 邮件。绝对不能用平台超级账号代用户操作——这是「权限混淆」漏洞的根源。</div>
          <div className="text-xs text-gray-600">怎么观察:四种 userId 跑出来四态:① alice(有 OAuth)→ per-user 邮件;② bob(有 OAuth)→ per-user 邮件(另一组);③ platform-god → 第一钩子 fail-closed 直接拒;④ carol(无 OAuth)→ 第二钩子拒。看 read_recent_emails.tool_result 的邮件是否 per-user 隔离。</div>
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
    const port = (env && env.port) || 50036;
    let text = "端口 " + port + " · 加载中";
    if (err) text = "端口 " + port + " · /health 失败：" + err;
    else if (env) {
      const oauthUsers = env.oauthUsers || [];
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
        ((env.tools || []).map((t) => t.name).join("/")) +
        " · OAuth用户 " +
        (oauthUsers.join("/") || "(空)");
    }
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">{text}</span>
      </footer>
    );
  }

  window.DemoUI = { StatusPill, PageIntro, EnvFooter };
})();