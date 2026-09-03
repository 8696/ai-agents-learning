/**
 * 职责：页面壳 —— 导航 / StatusPill / PageIntro / EnvFooter / useEnvInfo。
 * 数据流：GET /health → 页脚写「多提供商对照」或当前选中家；providers[] 给总览方言表。
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
    { href: "/pages/stream.html", label: "流式对照", match: "stream" },
  ];

  function currentKey() {
    var p = window.location.pathname;
    if (p === "/" || p.endsWith("/index.html")) return "index";
    if (p.endsWith("/stream.html")) return "stream";
    return "";
  }

  /**
   * §5.3.9：每页加载即拉环境信息。
   * provider 在本条是 null（不跟顶层 LLM_PROVIDER），页脚改写「多提供商对照」。
   * 没拿到时保留「(待连接)」占位，不留空白。
   */
  function useEnvInfo() {
    var envState = React.useState({
      provider: "(待连接)",
      model: "(待连接)",
      port: null,
      hasKey: false,
      providers: [],
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
            provider: h.provider || "多提供商对照",
            model: h.model || "多提供商对照",
            port: h.port,
            hasKey: Boolean(h.hasKey),
            providers: h.providers || [],
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
   * §5.3.9 页脚环境条：全站唯一权威位置。
   * 本条默认「多提供商对照」；流式页可传入当前勾选的那一家，禁止写死某一款模型 id。
   */
  function EnvFooter({ env, selectedProvider, selectedModel }) {
    var provider = selectedProvider || env.provider || "多提供商对照";
    var model = selectedModel || env.model || "多提供商对照";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {env.port || 50205} · 协议 A/B 对照 · provider{" "}
          <span className="font-mono">{provider}</span> · model{" "}
          <span className="font-mono">{model}</span> · Key{" "}
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
