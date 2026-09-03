/**
 * 职责：页面壳组件 —— 顶栏导航 / 状态 pill / 说明区 / 页脚环境条。
 * 数据流：
 *   GET /health → useEnvInfo() → EnvFooter 渲染 provider / model / port / Key
 *   pathname    → PageNav 高亮当前页
 * 页脚强制写「协议 B」。model 来自 /health（modelB），禁止写死。
 *
 * 挂载：window.DemoUI.{ PageNav, StatusPill, PageIntro, EnvFooter, useEnvInfo }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  var STATUS_MAP = {
    idle: { emoji: "⏸", text: "待连接", cls: "bg-gray-200" },
    loading: { emoji: "🔄", text: "请求中", cls: "bg-blue-100" },
    ok: { emoji: "✅", text: "完成", cls: "bg-green-100" },
    error: { emoji: "❌", text: "错误", cls: "bg-red-100" },
  };

  var NAV_ITEMS = [
    { href: "/", label: "总览", match: "index" },
    { href: "/pages/text.html", label: "无 tools", match: "text" },
    { href: "/pages/tool-use.html", label: "tool-use", match: "tool-use" },
    { href: "/pages/tool-rejected.html", label: "诱导守约", match: "tool-rejected" },
  ];

  function currentKey() {
    var p = window.location.pathname;
    if (p === "/" || p.endsWith("/index.html")) return "index";
    if (p.endsWith("/text.html")) return "text";
    if (p.endsWith("/tool-use.html")) return "tool-use";
    if (p.endsWith("/tool-rejected.html")) return "tool-rejected";
    return "";
  }

  function useEnvInfo() {
    var envState = React.useState({
      provider: "(待连接)",
      model: "(待连接)",
      port: null,
      hasKey: false,
    });
    var env = envState[0];
    var setEnv = envState[1];
    var errState = React.useState("");
    var envError = errState[0];
    var setEnvError = errState[1];

    React.useEffect(function () {
      fetch("/health")
        .then(function (r) {
          if (!r.ok) throw new Error("GET /health HTTP " + r.status);
          return r.json();
        })
        .then(function (h) {
          setEnv({
            provider: h.provider || "(未指定)",
            model: h.model || "(未指定)",
            port: h.port,
            hasKey: Boolean(h.hasKey),
          });
        })
        .catch(function (e) {
          setEnvError(e.message);
        });
    }, []);

    return { env: env, envError: envError };
  }

  function PageNav() {
    var cur = currentKey();
    return (
      <nav id="page-nav" className="flex flex-wrap gap-2 text-sm">
        {NAV_ITEMS.map(function (item) {
          var active = item.match === cur;
          return (
            <a
              key={item.href}
              href={item.href}
              className={
                active
                  ? "px-2 py-1 rounded bg-blue-600 text-white"
                  : "px-2 py-1 rounded border border-gray-300 hover:border-blue-500"
              }
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    );
  }

  function StatusPill({ status }) {
    var s = STATUS_MAP[status] || STATUS_MAP.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + s.cls}>
        {s.emoji} {s.text}
      </span>
    );
  }

  function PageIntro({ summary, steps, extra }) {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">本页只演示：</span>
          {summary}
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          {steps.map(function (s, i) {
            return <li key={i}>{s}</li>;
          })}
        </ol>
        {extra}
      </section>
    );
  }

  /** 页脚强制「协议 B」；port 默认 50016，真正数字以 /health 为准。 */
  function EnvFooter({ env }) {
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {env.port || 50016} · 协议 B · provider{" "}
          <span className="font-mono">{env.provider}</span> · model{" "}
          <span className="font-mono">{env.model}</span> · Key{" "}
          {env.hasKey ? "✅" : "❌（apps/.env 未配置该家 Key）"}
        </span>
      </footer>
    );
  }

  window.DemoUI.PageNav = PageNav;
  window.DemoUI.StatusPill = StatusPill;
  window.DemoUI.PageIntro = PageIntro;
  window.DemoUI.EnvFooter = EnvFooter;
  window.DemoUI.useEnvInfo = useEnvInfo;
})();
