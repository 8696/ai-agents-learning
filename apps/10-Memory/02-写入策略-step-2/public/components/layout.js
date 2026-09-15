/**
 * 职责：页头状态、教学说明（含本页核心教学点卡片）、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // StatusPill 四态：⏸待连接 / 🔄请求中 / ✅完成 / ❌错误。颜色语义固定。
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

  // PageIntro：本页只演示第 3 关「把关」的第一刀——置信度阈值。
  // 数据流 4 步：写原文 + 调阈值 → 调 /api/filter → 提取 + 置信度判定 → 「通过 / 拦下」两堆原样上页。
  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第三关「把关（Filtering）」的第一刀——置信度阈值（Confidence Threshold）。
          拿 step-1 的提取结果，按页面上阈值滑块选中的值（0~1），逐条比较 confidence 是否达到阈值：
          <b>达到 = 通过，能进库；达不到 = 拦下，原因为 BELOW_THRESHOLD</b>。
          其他三道把关（三道内容维度 / 敏感信息过滤 / 人工确认）留到 step-(N+1) 承接。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文（或点下面的例句按钮），把滑块调到你想要的阈值。</li>
          <li>点「提取并把关」按钮，浏览器 POST /api/filter，body 带 text + threshold。</li>
          <li>服务端先调 extractFacts（与 step-1 同源）拿到候选清单，再调 filterByConfidence 按阈值逐条判定。</li>
          <li>页面把「通过 / 拦下」两堆原样画出来：绿卡 = 通过、红卡 = 拦下 + 拦下理由。同一段原文调两次（阈值 0.8 vs 阈值 0.3）就能看见同一候选从「不写」翻到「写」。</li>
          <li>仍保留「只提取（对照）」按钮调 step-1 的 /api/extract，方便看清「把关这一刀切掉了什么」。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">置信度阈值是「把关」的第一道可调闸门</span>：
              阈值是工程参数，不是模型自己能决定的——它必须由产品 / 业务给定，写在代码里，调阈值能直接看见「哪些候选翻面」。
            </li>
            <li>
              <span className="font-medium">拦下要显式给出理由（rejectReason）</span>：
              BELOW_THRESHOLD 是这一次拦下的具体原因，排查时知道是哪一刀切的；后面再加深（维度 A/B/C / 敏感信息）会用不同的 rejectReason 区分。
            </li>
            <li>
              <span className="font-medium">置信度高的候选也要把关，不能直接信任模型</span>：
              模型给的 confidence 是它自己的判断，不是事实——它把用户的犹豫、假设、举例都标了高置信度，阈值是兜底而不是绝对。
            </li>
            <li>
              <span className="font-medium">把关这一刀切掉的不该是「该写的」</span>：
              调低阈值会放过更多候选，但模型本来把握就不高的（比如把假设当事实）放进库，三个月后会污染召回；调高阈值会拦掉更多，但同时也可能误杀有用的偏好。
              <span className="font-medium">阈值怎么定 = 业务取舍</span>，跟具体场景强相关。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  // EnvFooter：端口 fallback 50105；协议 A + provider + model + 密钥（apps/.env）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50105;
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
