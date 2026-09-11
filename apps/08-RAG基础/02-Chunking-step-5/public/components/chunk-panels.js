/**
 * 职责：chunkByFixed / chunkByStructure / chunkByFaq 切块结果展示——左栏 LeftPanel（自带 size / overlap 滑块）、
 * 中栏 Panel（按结构切）、右栏 RightPanel（FAQ 切，带文档来源说明）。
 * 挂 window.DemoUI。三个 Panel 拆三个组件文件，stats / ChunkCard 通用部分留本文件。
 *
 * step-2：ChunkCard 显示字符 / token 三种数法 + 兜底再切徽标；StatsBar 显示 fallbackChunks。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  /**
   * 单块卡（ChunkCard）：每块用一块卡片展示——块序号 / 字符数 / 估算 token / 边界徽标 / 半句话标记 / 兜底徽标 / 原文。
   * 切口处高亮「与上一块重叠」的部分。
   */
  function ChunkCard(props) {
    const chunk = props.chunk;
    const isMid = chunk.startsMidSentence;
    const estimateMode = props.estimateMode || "mixed"; // "mixed" | "chinese" | "english"
    const boundaryLabel = {
      fixed: "fixed",
      "##": "##",
      段落: "段落",
      句号: "句号",
      "faq-q": "faq-q",
      "fallback-fixed": "兜底再切",
    }[chunk.boundary] || chunk.boundary;
    const tokenCount =
      estimateMode === "chinese"
        ? chunk.approxTokensChinese
        : estimateMode === "english"
        ? chunk.approxTokensEnglish
        : chunk.approxTokens;
    const tokenLabel = estimateMode === "chinese" ? "≈ 汉字 token" : estimateMode === "english" ? "≈ 英文词 token" : "≈ token 混合";
    const overlap = chunk.overlapWithPrev || 0;
    return (
      <div className={"border rounded p-2 space-y-1 " + (chunk.fallbackSplit ? "border-orange-300 bg-orange-50" : isMid ? "border-red-300 bg-red-50" : "border-gray-300 bg-white")}>
        <div className="flex flex-wrap gap-2 items-center text-xs text-gray-700">
          <span className="font-semibold">块 {chunk.index + 1}</span>
          <span className="text-gray-500">字符 {chunk.charCount}</span>
          <span className="text-gray-500">{tokenLabel} {tokenCount}</span>
          <span className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-600">{boundaryLabel}</span>
          {chunk.fallbackSplit ? <span className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-800">兜底再切</span> : null}
          {isMid ? <span className="px-1.5 py-0.5 rounded bg-red-200 text-red-800">半句话开头</span> : null}
          {overlap > 0 ? <span className="text-gray-500">与上一块重叠 {overlap} 字</span> : null}
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-800 max-h-32 overflow-auto">{renderHighlightedText(chunk)}</pre>
      </div>
    );
  }

  /** 在「与上一块重叠」的字符上加高亮底色（黄） */
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

  /** 统计摘要条：块数 / 总字符 / 平均 / 最大 / 最小 / 半句话块数 / 兜底块数 */
  function StatsBar(props) {
    const stats = props.stats;
    if (!stats) return null;
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
        {typeof stats.fallbackChunks === "number" && stats.fallbackChunks > 0 ? (
          <span className="text-orange-700">兜底再切 <b>{stats.fallbackChunks}</b></span>
        ) : null}
      </div>
    );
  }

  /** 通用栏：标题 + 跑按钮 + 摘要 + 块列表 + 空态（中栏 / 右栏用） */
  function Panel(props) {
    const { title, hint, running, result, error, onRun, buttonText, buttonHint, estimateMode } = props;
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
            <StatsBar stats={result.stats} />
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {result.chunks.length === 0 ? (
                <p className="text-xs text-gray-500">没有切出任何块（输入为空？）</p>
              ) : (
                result.chunks.map(function (c) { return <ChunkCard key={c.index} chunk={c} estimateMode={estimateMode} />; })
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
   *
   * step-2：多接 estimateMode + 把滑块文案更新（含"按字符 / 按词元 / 按汉字"提示）。
   */
  function LeftPanel(props) {
    const { running, result, error, onRun, sizeVal, setSizeVal, overlap, setOverlap, estimateMode, setEstimateMode } = props;
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
        <div className="border border-gray-200 rounded p-2 bg-gray-50 space-y-1">
          <div className="text-xs font-semibold text-gray-700">step-2 · A 件 · 单位对照</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input type="radio" name="estimateMode" value="mixed" checked={estimateMode === "mixed"} onChange={function () { setEstimateMode("mixed"); }} />
              <span>混合估算（汉字 1.5 + 英文 1.3）</span>
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="estimateMode" value="chinese" checked={estimateMode === "chinese"} onChange={function () { setEstimateMode("chinese"); }} />
              <span>按汉字 1 token / 字</span>
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="estimateMode" value="english" checked={estimateMode === "english"} onChange={function () { setEstimateMode("english"); }} />
              <span>按英文词 1 token / 词</span>
            </label>
          </div>
          <p className="text-xs text-gray-500">同一个 size=512，英文教程 vs 中文文档切出来的块数会差几倍——这就是为什么不能直接抄英文教程的数字。</p>
        </div>
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error || error.message || "失败"}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
        {result ? (
          <>
            <StatsBar stats={result.stats} />
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {result.chunks.length === 0 ? (
                <p className="text-xs text-gray-500">没有切出任何块（输入为空？）</p>
              ) : (
                result.chunks.map(function (c) { return <ChunkCard key={c.index} chunk={c} estimateMode={estimateMode} />; })
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