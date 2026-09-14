/**
 * 职责：页头状态、教学说明、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  };

  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：给一句用户原话，调大模型判断它属于四类记忆（工作记忆 / 情景记忆 / 语义记忆 / 程序性记忆）里的哪一类，再判它更该存短期还是长期，并给一句理由。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一句话（或点下面的例句按钮），点「归类这句话」。</li>
          <li>浏览器 POST /api/classify，服务端把这句话拼进 messages，调对话补全（JSON Mode）判类。</li>
          <li>页面把「模型实际收到的请求」和「模型实际返回的响应」原样贴出来，再把判类结果画进下面四个盒子。</li>
          <li>命中的那个盒子会高亮，旁边写短期/长期和理由；下方历史列表可以看多句话各自落进了哪个盒子。</li>
          <li>空输入会得到 4xx；「演示后端 5xx」按钮走另一条失败通道。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">四类记忆是内容分类，短期/长期是另一根轴</span>：判类结果同时给出两个维度，
              不要把「情景记忆」和「短期」当成同义词——情景记忆两侧都有。
            </li>
            <li>
              <span className="font-medium">判类靠模型理解语义，不是关键词匹配</span>：这一步真调大模型（JSON Mode），
              因为「今天有点累先到这」这类一次性状态，规则很容易误判成长期事实。
            </li>
            <li>
              <span className="font-medium">本步的边界</span>：只做单次判类，不做跨会话存储、不做重启验证——那是覆盖
              「重启后还在吗」判定口径的下一步要加的能力，本步先把「掉进哪个盒子」这件事看清楚。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50100;
    const hasKey = Boolean(env.hasKey);
    const providerLabel = env.provider ? String(env.provider) : "（待连接）";
    const modelLabel = env.model ? String(env.model) : "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {modelLabel} · 密钥{" "}
          {hasKey ? "✅" : "❌（apps/.env 未配置该家密钥）"}
        </span>
      </footer>
    );
  };
})();
