/**
 * 职责：页面壳组件 —— 顶栏导航 / 状态 pill / 说明区 / 页脚环境条。
 * 数据流：
 *   GET /health → useEnvInfo() → EnvFooter 渲染 provider / model / port / Key
 *   pathname    → PageNav 高亮当前页
 *   status      → StatusPill 四态
 * 为什么单独成文件：这几个是「每一页都长一样」的壳，业务卡片在 rounds.js。
 *
 * 挂载：window.DemoUI.{ PageNav, StatusPill, PageIntro, EnvFooter, useEnvInfo }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  // ── §5.3.4 状态四态：请求中禁用按钮，失败红色 ──
  var STATUS_MAP = {
    idle: { emoji: "⏸", text: "待连接", cls: "bg-gray-200" },
    loading: { emoji: "🔄", text: "请求中", cls: "bg-blue-100" },
    ok: { emoji: "✅", text: "完成", cls: "bg-green-100" },
    error: { emoji: "❌", text: "错误", cls: "bg-red-100" },
  };

  // ── 与 public/pages 文件名对齐；加页面只改这一处 ──
  var NAV_ITEMS = [
    { href: "/", label: "总览", match: "index" },
    { href: "/pages/run.html", label: "单 / 并行", match: "run" },
    { href: "/pages/serial.html", label: "串行依赖", match: "serial" },
    { href: "/pages/realistic.html", label: "差旅助手", match: "realistic" },
    { href: "/pages/zod-error.html", label: "Zod repair", match: "zod-error" },
    { href: "/pages/tool-error.html", label: "工具失败", match: "tool-error" },
  ];

  function currentKey() {
    var p = window.location.pathname;
    if (p === "/" || p.endsWith("/index.html")) return "index";
    if (p.endsWith("/run.html")) return "run";
    if (p.endsWith("/serial.html")) return "serial";
    if (p.endsWith("/realistic.html")) return "realistic";
    if (p.endsWith("/zod-error.html")) return "zod-error";
    if (p.endsWith("/tool-error.html")) return "tool-error";
    return "";
  }

  /**
   * §5.3.9：每页加载即拉环境信息。
   * 没拿到时保留「(待连接)」占位，不留空白；hasKey=false 时页面应禁用主按钮。
   */
  function useEnvInfo() {
    var envState = React.useState({
      provider: "(待连接)",
      model: "(待连接)",
      port: null,
      hasKey: false,
      tools: [],
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
            tools: h.tools || [],
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

  /**
   * §5.3.11 说明区：本页演示什么 + 数据流步骤。
   * summary = 一句话；steps = 3～5 步；extra = 可选补充节点。
   */
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

  /**
   * §5.3.9 页脚环境条：全站唯一权威位置，禁止在别处写死 provider / model。
   */
  function EnvFooter({ env, protocol }) {
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {env.port || 50501} · 协议 {protocol || "A"} · provider{" "}
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
