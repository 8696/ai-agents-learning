/**
 * 职责：左 / 中 / 右 三栏块列表组件。每栏独立接收自己的 chunks + stats；
 * 不在父组件内联 JSX 里全堆——单页多组件（§5.3.8）。挂 window.DemoUI。
 *
 * 三栏对应三种切法：
 *   LeftPanel    = 固定长度切（叠加 size / overlap 滑块 UI 之外的部分）
 *   MiddlePanel  = 按结构切
 *   RightPanel   = FAQ 切
 */
(function () {
  const DemoUI = window.DemoUI || {};

  /**
   * 单块卡（ChunkCard）：每块用一块卡片展示——块序号 / 字符数 / 估算 token / 边界徽标 / 半句话标记 / 原文。
   * 切口处高亮「与上一块重叠」的部分。
   */
  function ChunkCard(props) {
    const chunk = props.chunk;
    const isMid = chunk.startsMidSentence;
    const boundaryLabel = {
      fixed: "fixed",
      "##": "##",
      段落: "段落",
      句号: "句号",
      "faq-q": "faq-q",
      "fallback-fixed": "fixed",
    }[chunk.boundary] || chunk.boundary;
    const overlap = chunk.overlapWithPrev || 0;
    return (
      <div className={"border rounded p-2 space-y-1 " + (isMid ? "border-red-300 bg-red-50" : "border-gray-300 bg-white")}>
        <div className="flex flex-wrap gap-2 items-center text-xs text-gray-700">
          <span className="font-semibold">块 {chunk.index + 1}</span>
          <span className="text-gray-500">字符 {chunk.charCount}</span>
          <span className="text-gray-500">≈ {chunk.approxTokens} token</span>
          <span className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-600">{boundaryLabel}</span>
          {isMid ? <span className="px-1.5 py-0.5 rounded bg-red-200 text-red-800">半句话开头</span> : null}
          {overlap > 0 ? <span className="text-gray-500">与上一块重叠 {overlap} 字</span> : null}
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-800 max-h-32 overflow-auto">{renderHighlightedText(chunk)}</pre>
      </div>
    );
  }

  /** 在「与上一块重叠」的字符上加高亮底色（红黄） */
  function renderHighlightedText(chunk) {
    if (!chunk.overlapWithPrev || chunk.overlapWithPrev <= 0) {
      return chunk.text;
    }
    const overlapLen = chunk.overlapWithPrev;
    if (overlapLen >= chunk.text.length) return chunk.text;
    const head = chunk.text.slice(0, overlapLen);
    const tail = chunk.text.slice(overlapLen);
    return (
      <>
        <span className="bg-yellow-200 text-gray-900">{head}</span>
        <span>{tail}</span>
      </>
    );
  }

  /** 启发式「一块里塞了几个 ## 主题 / 几个独立编号段」——
   *  数 ## 出现次数 + 数【X】/ 一、 / 1. 这种可被看作新主题的标记。
   *  仅作变体 1 提示用，不替代真实主题识别。返回整型数组（每块一个）。 */
  function countTopicMarkers(text) {
    if (!text) return 0;
    let n = 0;
    const h2 = text.match(/^##\s+/gm);
    if (h2) n += h2.length;
    // 【一】~【十】 这种编号小标题（一节多主题时常用）
    const bracket = text.match(/【[一二三四五六七八九十百千]+】/g);
    if (bracket) n += bracket.length;
    return n;
  }

  function buildTopicCounts(chunks) {
    return (chunks || []).map(function (c) { return countTopicMarkers(c.text); });
  }

  /** 统计摘要条：块数 / 总字符 / 平均 / 最大 / 最小 / 半句话块数 / 启发式主题数 */
  function StatsBar(props) {
    const stats = props.stats;
    if (!stats) return null;
    // 启发式「一块塞了 N 个主题」：## 出现次数 - 1（除掉首个），最少 1。
    // 仅作变体 1 提示；真实主题数需要专门识别器（未实现）。
    const chunkTopicCount = props.topicCounts || [];
    const sumTopicCount = chunkTopicCount.reduce(function (a, b) { return a + b; }, 0);
    return (
      <div className="flex flex-wrap gap-3 text-xs text-gray-700 border border-gray-200 bg-gray-50 rounded px-2 py-1">
        <span>块数 <b className="text-gray-900">{stats.total}</b></span>
        <span>总字符 <b className="text-gray-900">{stats.totalChars}</b></span>
        <span>平均 <b className="text-gray-900">{stats.avgChars}</b></span>
        <span>最大 <b className="text-gray-900">{stats.maxChars}</b></span>
        <span>最小 <b className="text-gray-900">{stats.minChars}</b></span>
        <span className={stats.midSentenceCount > 0 ? "text-red-700" : "text-gray-500"}>
          半句话块 <b>{stats.midSentenceCount}</b>
        </span>
        {chunkTopicCount.length > 0 ? (
          <span className={sumTopicCount > stats.total ? "text-orange-700" : "text-gray-500"}>
            一块塞 <b>{Math.max(1, Math.round(sumTopicCount / Math.max(1, stats.total)))}</b> 个 ## 主题（启发式）
          </span>
        ) : null}
      </div>
    );
  }

  /** 通用栏：标题 + 跑按钮 + 摘要 + 块列表 + 空态（中栏 / 右栏用） */
  function Panel(props) {
    const { title, hint, running, result, error, onRun, buttonText, buttonHint } = props;
    const topicCounts = result ? buildTopicCounts(result.chunks) : [];
    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            disabled={running}
            onClick={onRun}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {buttonText || "跑"}
          </button>
        </div>
        {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
        {buttonHint ? <p className="text-xs text-gray-500">{buttonHint}</p> : null}
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error || error.message || "失败"}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
        {result ? (
          <>
            <StatsBar stats={result.stats} topicCounts={topicCounts} />
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {result.chunks.length === 0 ? (
                <p className="text-xs text-gray-500">没有切出任何块（输入为空？）</p>
              ) : (
                result.chunks.map(function (c) { return <ChunkCard key={c.index} chunk={c} />; })
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">点上方按钮跑一次，看本页怎么切。</p>
        )}
      </section>
    );
  }

  /**
   * 左栏专用（固定长度切）：自带 size / overlap 滑块——这两个参数只影响这一栏，
   * 放在共用 #controls 会让人误以为也影响中栏 / 右栏。
   */
  function LeftPanel(props) {
    const { running, result, error, onRun, sizeVal, setSizeVal, overlap, setOverlap } = props;
    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">左：固定长度切（fixed）</h2>
          <button
            type="button"
            disabled={running}
            onClick={onRun}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            跑固定长度切
          </button>
        </div>
        <p className="text-xs text-gray-500">size / overlap 滑块只影响这一栏；中栏 / 右栏的按钮不受这两个值影响。</p>
        <p className="text-xs text-gray-500">点这一栏的按钮会调 POST /api/chunk/fixed；块大小固定、切口可能切在半句话中间。</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-gray-200 rounded p-2 bg-gray-50">
          <label className="text-xs text-gray-700 space-y-1 block">
            <span>块大小（size · 字符）</span>
            <input
              type="range"
              min="50"
              max="3000"
              step="50"
              value={sizeVal}
              onChange={function (e) { setSizeVal(Number(e.target.value)); }}
              className="w-full"
            />
            <span className="text-gray-500">{sizeVal} 字符</span>
          </label>
          <label className="text-xs text-gray-700 space-y-1 block">
            <span>重叠（overlap · 字符）</span>
            <input
              type="range"
              min="0"
              max="500"
              step="10"
              value={overlap}
              onChange={function (e) { setOverlap(Number(e.target.value)); }}
              className="w-full"
            />
            <span className="text-gray-500">{overlap} 字符（建议 ≤ size 的 20%）</span>
          </label>
        </div>
        <p className="text-xs text-orange-700">
          变体 1 演示：点上方「加载混合示例」按钮加载「## 大杂烩（5 个主题）」文档，size 拉到 3000 → 左栏一整块把 5 个主题全吃；摘要条里「一块塞 N 个主题（启发式）」会 ≥ 3，向量方向被平均掉。
        </p>
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error || error.message || "失败"}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
        {result ? (
          <>
            <StatsBar stats={result.stats} topicCounts={buildTopicCounts(result.chunks)} />
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {result.chunks.length === 0 ? (
                <p className="text-xs text-gray-500">没有切出任何块（输入为空？）</p>
              ) : (
                result.chunks.map(function (c) { return <ChunkCard key={c.index} chunk={c} />; })
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">改完上面滑块后点「跑固定长度切」看效果。</p>
        )}
      </section>
    );
  }

  DemoUI.Panel = Panel;
  DemoUI.LeftPanel = LeftPanel;
  DemoUI.StatsBar = StatsBar;
  DemoUI.ChunkCard = ChunkCard;
  window.DemoUI = DemoUI;
})();