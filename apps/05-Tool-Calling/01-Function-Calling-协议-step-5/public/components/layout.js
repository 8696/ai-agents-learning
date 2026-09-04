/**
 * 职责：页面壳组件 —— 顶栏状态 pill、页间导航、说明区、页脚环境条，以及拉 /health 的 hook。
 *
 * 数据流：
 *   GET /health → useEnvInfo() → EnvFooter 渲染 provider / model / port / Key（§5.3.9）
 *   location.pathname → PageNav 高亮当前页
 *   页面的 status 状态 → StatusPill 四态
 *
 * 为什么单独成文件：这几个「每页长得都一样」的壳跟业务无关；
 * 业务卡片（gantt / 结果 / 加速比）在 components/gantt.js + 各页内联块。
 *
 * 挂载：window.DemoUI.{ PageNav, StatusPill, PageIntro, EnvFooter, useEnvInfo }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  // ── §5.3.4 状态四态 ──
  var STATUS_MAP = {
    idle: { emoji: "⏸", text: "待连接", cls: "bg-gray-200" },
    running: { emoji: "🔄", text: "请求中", cls: "bg-yellow-200" },
    ok: { emoji: "✅", text: "完成", cls: "bg-green-200" },
    error: { emoji: "❌", text: "错误", cls: "bg-red-200" },
  };

  // ── 与 public/pages 文件名一一对应；加页面只改这一处 ──
  var NAV_ITEMS = [
    { href: "/", label: "总览", match: "index" },
    { href: "/pages/self-correct.html", label: "模型自编排（while + 自纠）", match: "self-correct" },
  ];

  function currentKey() {
    var p = window.location.pathname;
    if (p === "/" || p.endsWith("/index.html")) return "index";
    if (p.endsWith("/self-correct.html")) return "self-correct";
    return "";
  }

  function useEnvInfo() {
    var envState = React.useState({
      provider: "(待连接)",
      model: "(待连接)",
      port: null,
      hasKey: false,
      callsModel: false,
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
            provider: h.provider || "(未配置)",
            model: h.model || "(未配置)",
            port: h.port,
            hasKey: Boolean(h.hasKey),
            callsModel: Boolean(h.callsModel),
          });
        })
        .catch(function (e) { setEnvError(e.message); });
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
          {steps.map(function (s, i) { return <li key={i}>{s}</li>; })}
        </ol>
        {extra}
      </section>
    );
  }

  /**
   * step-3 是 mock demo：页脚标"本地 mock · 不调 LLM"。
   * 端口兜底 50019（§5.3.3 算的默认口），真实值仍以 /health 返回的为准。
   */
  function EnvFooter({ env }) {
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {env.port || 50021} · 本地 mock · 不调 LLM · provider{" "}
          <span className="font-mono">{env.provider}</span> · model{" "}
          <span className="font-mono">{env.model}</span> · Key {env.hasKey ? "✅" : "❌"}
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
