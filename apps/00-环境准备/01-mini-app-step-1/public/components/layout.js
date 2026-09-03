/**
 * 职责：页面壳组件 —— 顶栏状态 pill、页间导航、说明区、页脚环境条，以及拉 /health 的 hook。
 *
 * 数据流：
 *   GET /health → useEnvInfo() → EnvFooter 渲染 provider / model / port / Key（§5.3.9）
 *   location.pathname → PageNav 高亮当前页
 *   页面的 status 状态 → StatusPill 四态
 *
 * 为什么单独成文件：这几个「每页长得都一样」的壳跟业务无关；
 * 业务卡片（答案 / 用量 / 原始帧）在 components/stream-cards.js。
 *
 * 挂载：window.DemoUI.{ PageNav, StatusPill, PageIntro, EnvFooter, useEnvInfo }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  // ── §5.3.4 状态四态：请求中禁用按钮、失败红色，四个页面共用同一套语汇 ──
  var STATUS_MAP = {
    idle: { emoji: "⏸", text: "待连接", cls: "bg-gray-200" },
    loading: { emoji: "🔄", text: "请求中", cls: "bg-blue-100" },
    ok: { emoji: "✅", text: "完成", cls: "bg-green-100" },
    error: { emoji: "❌", text: "错误", cls: "bg-red-100" },
  };

  // ── 与 public/pages 文件名一一对应；加页面只改这一处 ──
  var NAV_ITEMS = [
    { href: "/", label: "总览", match: "index" },
    { href: "/pages/chat.html", label: "流式对话", match: "chat" },
    { href: "/pages/frames.html", label: "原始帧", match: "frames" },
  ];

  function currentKey() {
    var p = window.location.pathname;
    if (p === "/" || p.endsWith("/index.html")) return "index";
    if (p.endsWith("/chat.html")) return "chat";
    if (p.endsWith("/frames.html")) return "frames";
    return "";
  }

  /**
   * §5.3.9：每页加载就打一次 /health，把「现在用谁家的哪个模型」写进页脚。
   * 拿不到时保留「(待连接)」占位而不是空白，否则读者分不清「没配」和「没加载」。
   * reload 给总览页的「重新检测环境」按钮用：改完 apps/.env 重启服务后不用刷新整页。
   */
  function useEnvInfo() {
    var envState = React.useState({
      provider: "(待连接)",
      model: "(待连接)",
      modelB: "(待连接)",
      port: null,
      protocol: "A",
      endpoint: "",
      hasKey: false,
      raw: null,
    });
    var env = envState[0];
    var setEnv = envState[1];

    var errState = React.useState("");
    var envError = errState[0];
    var setEnvError = errState[1];

    var loadingState = React.useState(false);
    var envLoading = loadingState[0];
    var setEnvLoading = loadingState[1];

    var load = React.useCallback(function () {
      setEnvLoading(true);
      setEnvError("");
      return fetch("/health")
        .then(function (r) {
          if (!r.ok) throw new Error("GET /health HTTP " + r.status);
          return r.json();
        })
        .then(function (h) {
          setEnv({
            provider: h.provider || "(未配置)",
            model: h.model || "(未配置)",
            modelB: h.modelB || "(未配置)",
            port: h.port,
            protocol: h.protocol || "A",
            endpoint: h.endpoint || "",
            hasKey: Boolean(h.hasKey),
            raw: h,
          });
          return h;
        })
        .catch(function (e) {
          // fetch reject（服务没起）与 HTTP 非 200 都落到这里，页面用红字显示
          setEnvError(e.message);
          throw e;
        })
        .finally(function () {
          setEnvLoading(false);
        });
    }, []);

    React.useEffect(
      function () {
        load().catch(function () {
          /* 已经写进 envError，这里吞掉避免 unhandled rejection */
        });
      },
      [load],
    );

    return { env: env, envError: envError, envLoading: envLoading, reloadEnv: load };
  }

  /** 页间导航：三个场景各一页，不用 tab 把无关场景叠在一起（§5.3.8）。 */
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

  /** 顶栏右上角的状态徽标：四态由页面的请求生命周期驱动，颜色见 STATUS_MAP。 */
  function StatusPill({ status }) {
    var s = STATUS_MAP[status] || STATUS_MAP.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + s.cls}>
        {s.emoji} {s.text}
      </span>
    );
  }

  /**
   * §5.3.11 说明区：一句「本页只演示什么」+ 3～5 步数据流。
   * extra 用来放本页额外的图（总览页的全局数据流就走这里）。
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
   * 端口兜底写 50000（本条 §5.3.3 算出的默认口），真实值仍以 /health 返回的为准。
   */
  function EnvFooter({ env }) {
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {env.port || 50000} · 协议 {env.protocol || "A"} · provider{" "}
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
