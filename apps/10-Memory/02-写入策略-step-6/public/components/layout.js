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

  // PageIntro：本页只演示第 3 关「把关」的最后一刀——人工确认（变体 3-D）。
  // 数据流 4 步：写原文 + 调阈值/分档阈值/维度开关 → 调 /api/filter-dimensions → 六道闸门顺序判定
  //              → 「高档通过 / 中档待确认 / 置信度拦下 / 维度拦下」四块 + 攒起来机制
  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第三关「把关（Filtering）」的最后一刀——
          <b>人工确认（变体 3-D）</b>。在 step-5 的维度 A / B / C / PII 之上，把过了所有维度的候选按 confidence 再分三档：
          <b>高（≥ highThreshold，默认 0.8）自动通过、中（midThreshold ≤ conf {"<"} highThreshold，默认 0.5~0.8）攒起来进「待确认」区、低（{"<"} midThreshold）已被 step-2 拦下</b>。
          中档候选页面展示卡片 + [记住] / [不用] 按钮，点完调 POST /api/confirm 移出 / 移除。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文（或点下面的例句按钮），调两个分档阈值滑块（highThreshold / midThreshold），选好四个维度开关（A / B / C / PII，默认都开）。</li>
          <li>点「提取并把关」按钮，浏览器 POST /api/filter-dimensions，body 带 text + highThreshold + midThreshold + enableA / enableB / enableC / enablePii。</li>
          <li>服务端走六道闸门：① extractFacts 抽 0~N 条候选 → ② filterByConfidence 按 midThreshold 过滤（达不到标 BELOW_THRESHOLD）→ ③ filterByContentDimensions 让模型给过置信度的候选一次性判四道标签（A / B / C / PII）→ ④ splitByConfidence 按 highThreshold / midThreshold 分三档。</li>
          <li>页面分四块展示：高档自动通过（绿卡）+ 中档待确认（黄卡，每条有 [记住] / [不用] 按钮）+ 置信度拦下（灰字）+ 维度拦下（四色）。用户点 [记住] / [不用] → POST /api/confirm 把对应 verdict 从 pendingConfirmation 移到 passed 或丢弃（重启服务清空——见未做）。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">变体 3-D 折中做法的工程取舍</span>：
              高置信度自动写（不打扰）、中置信度攒起来让用户批量确认（不打断但保留纠错机会）、低置信度直接丢弃（不污染库）。
              比起「每条都问」——体验顺；比起「全自动」——用户有兜底。这是 ChatGPT 那种记忆功能的基本做法：偶尔在 UI 上标一条「新学到的」，用户不对可以一键删掉。
            </li>
            <li>
              <span className="font-medium">三档分档不是又一层过滤</span>：
              step-2 的置信度阈值是「过 / 不过」二元判定；step-6 的分档是「过 / 等你确认 / 不过」三态判定——分档后**中档不进 rejected 数组**而是进 pendingConfirmation 数组，UI 单独展示。
              中档候选是「模型有把握但你可能不同意」的灰色地带，正是人工确认机制存在的理由。
            </li>
            <li>
              <span className="font-medium">confidence 数字是模型自己给的，不是事实</span>：
              0.92 也可能把用户的假设当事实；0.45 也可能是真事只是模型说不准。
              高阈值（如 0.8）会拦掉更多（更保守），低阈值会放过更多（更激进）——这是工程取舍。
              分档让「中档」留给人判 = 风险最高的部分不交给模型。
            </li>
            <li>
              <span className="font-medium">攒起来的状态本步用内存数组模拟</span>：
              重启服务 pendingConfirmation 就清空——这是「演示用」的限制。
              生产系统必须用 SQLite（§5.3.17 通用 KV 抽象）持久化；这一步会留到 step-(N+1) 进事实库时一起做。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  // EnvFooter：端口 fallback 50109；协议 A + provider + model + 密钥（apps/.env）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50109;
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