/**
 * 职责：step-4 · F 件 · PDF 切块展示面板——每页独立卡片 + 跨页段落腰斩橙色徽标。
 *
 * 拆出来避免 index.html 超 400 行。
 * 挂 window.DemoUI.PdfChunkPanel。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  /**
   * 检测"跨页段落腰斩"：上一页末尾不是终结符 + 下一页开头是新句子 → 标记为腰斩。
   */
  function detectCrossPage(chunks) {
    const cuts = [];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].text;
      const cur = chunks[i].text;
      const prevEnd = prev.match(/[。！？!?.\n]/g);
      const prevLastPunc = prevEnd ? prevEnd[prevEnd.length - 1] : null;
      const curStartWithUpper = /^[A-Z一-龥]/.test(cur.slice(0, 30));
      if (prevLastPunc !== "。" && prevLastPunc !== "！" && prevLastPunc !== "？" && prevLastPunc !== "." && curStartWithUpper) {
        cuts.push(i);
      }
    }
    return cuts;
  }

  function PageCard(props) {
    const { chunk, pageNum, isCrossPage } = props;
    return (
      <div className={"border rounded p-2 space-y-1 " + (isCrossPage ? "border-orange-300 bg-orange-50" : "border-gray-300 bg-white")}>
        <div className="flex flex-wrap gap-2 items-center text-xs text-gray-700">
          <span className="font-semibold">第 {pageNum} 页</span>
          <span className="text-gray-500">字符 {chunk.charCount}</span>
          <span className="text-gray-500">≈ {chunk.approxTokens} token</span>
          <span className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-600">pdf-page</span>
          {isCrossPage ? <span className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-800">跨页段落腰斩</span> : null}
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-800 max-h-40 overflow-auto">{chunk.text}</pre>
      </div>
    );
  }

  function PdfChunkPanel(props) {
    const { running, result, error, onRun, fileName } = props;
    const cuts = result && result.chunks ? detectCrossPage(result.chunks) : [];
    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">PDF 按页切（每页 = 1 块）</h2>
          <span className="text-xs text-gray-500">{fileName ? "已选：" + fileName : "未选"}</span>
        </div>
        <p className="text-xs text-gray-500">
          选一个 PDF → POST /api/chunk/pdf（pdf-parse 按 \f 分页）→ 每页 = 1 个 Chunk，附带 page 字段。
          跨页段落会被腰斩——这是按页切的固有代价（变体 11）。
        </p>
        {result ? (
          <>
            <div className="flex flex-wrap gap-3 text-xs text-gray-700 border border-gray-200 bg-gray-50 rounded px-2 py-1">
              <span>页数 <b className="text-gray-900">{result.stats.pageCount}</b></span>
              <span>块数 <b className="text-gray-900">{result.stats.total}</b></span>
              <span>平均字符 <b className="text-gray-900">{result.stats.avgChars}</b></span>
              <span>最大 <b className="text-gray-900">{result.stats.maxChars}</b></span>
              <span className={cuts.length > 0 ? "text-orange-700" : "text-gray-500"}>
                跨页腰斩 <b>{cuts.length}</b>
              </span>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-auto">
              {result.chunks.map(function (c) {
                return <PageCard key={c.index} chunk={c} pageNum={c.index + 1} isCrossPage={cuts.indexOf(c.index) >= 0} />;
              })}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">点上方按钮选 PDF 文件并跑按页切。</p>
        )}
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
      </section>
    );
  }

  DemoUI.PdfChunkPanel = PdfChunkPanel;
  window.DemoUI = DemoUI;
})();