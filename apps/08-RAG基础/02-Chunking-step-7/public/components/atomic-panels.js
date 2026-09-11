/**
 * 职责：step-7 · atomic 三档对照卡——
 *   档 1「关闭 atomic」：直接 chunkByStructure → 表格被切 / 编号条款散开
 *   档 2「开启 atomic」：chunkByAtomic → 表格 / 代码块 / 编号条款整块保留
 *   档 3「开启 atomic + 超嵌入上限」：threshold 设小 → atomic 块超阈值标 fallbackSplit=true + overflowNote 说明
 *
 * 挂 window.DemoUI.AtomicComparePanel。
 *
 * 拆文件原因：§5.3.8「单页也要拆组件」——atomic 三档对照是独立教学点，与中栏 Panel 不混在一起。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  /**
   * 一档卡片：标题 + 跑按钮 + 摘要 + 块列表 + 空态
   * 通用结构，与 chunk-panels.js 的 Panel 一致，但只跑一次 /api/chunk/{structure,atomic,atomic-overflow}
   */
  function AtomicColumn(props) {
    const { title, hint, buttonText, running, result, error, onRun, buttonColor } = props;
    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            disabled={running}
            onClick={onRun}
            className={(buttonColor || "bg-blue-600") + " text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"}
          >
            {buttonText || "跑"}
          </button>
        </div>
        {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error || error.message || "失败"}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
        {result ? (
          <>
            <div className="flex flex-wrap gap-3 text-xs text-gray-700 border border-gray-200 bg-gray-50 rounded px-2 py-1">
              <span>块数 <b className="text-gray-900">{result.stats.total}</b></span>
              <span>总字符 <b className="text-gray-900">{result.stats.totalChars}</b></span>
              <span>最大 <b className="text-gray-900">{result.stats.maxChars}</b></span>
              <span className={result.stats.atomicBlocks > 0 ? "text-purple-700" : "text-gray-500"}>
                atomic 块 <b>{result.stats.atomicBlocks || 0}</b>
              </span>
              {typeof result.stats.atomicOverflow === "number" && result.stats.atomicOverflow > 0 ? (
                <span className="text-red-700">超阈值 <b>{result.stats.atomicOverflow}</b></span>
              ) : null}
            </div>
            <div className="space-y-2 max-h-[500px] overflow-auto">
              {result.chunks.length === 0 ? (
                <p className="text-xs text-gray-500">没有切出任何块（输入为空？）</p>
              ) : (
                result.chunks.map(function (c) { return window.DemoUI.ChunkCard({ key: c.index, chunk: c }); })
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
   * 三档对照容器：左档关 atomic / 中档开 atomic / 右档开 atomic + 超阈值
   * 三个按钮各自独立发请求——按 §5.3.8「对照拆请求」。
   */
  function AtomicComparePanel(props) {
    const { running, offResult, offErr, onRunOff, atomicResult, atomicErr, onRunAtomic, overflowResult, overflowErr, onRunOverflow, overflowThreshold } = props;
    return (
      <section id="atomic-compare" className="space-y-3">
        <div className="text-xs text-gray-600">
          atomic = 「不可切断的块」——表格 / 代码围栏 / 编号条款。三档对照：
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <AtomicColumn
            title="档 1 · 关闭 atomic"
            hint="直接调 chunkByStructure——表格可能被切两半、编号条款可能散开（看具体输入）"
            buttonText="跑关闭 atomic"
            buttonColor="bg-gray-600"
            running={running}
            result={offResult}
            error={offErr}
            onRun={onRunOff}
          />
          <AtomicColumn
            title="档 2 · 开启 atomic"
            hint="调 chunkByAtomic——表格 / 代码围栏 / 编号条款整块保留；剩余按结构切"
            buttonText="跑开启 atomic"
            buttonColor="bg-purple-600"
            running={running}
            result={atomicResult}
            error={atomicErr}
            onRun={onRunAtomic}
          />
          <AtomicColumn
            title={"档 3 · 开启 atomic + 阈值 " + overflowThreshold + "（演示超上限）"}
            hint="threshold 设小（如 200），大 atomic 块会被标 fallbackSplit=true 并给 overflowNote——按变体 14「宁可超过 size 上限也不切开，超过嵌入上限时再单独处理」"
            buttonText="跑超阈值演示"
            buttonColor="bg-red-600"
            running={running}
            result={overflowResult}
            error={overflowErr}
            onRun={onRunOverflow}
          />
        </div>
      </section>
    );
  }

  DemoUI.AtomicComparePanel = AtomicComparePanel;
  window.DemoUI = DemoUI;
})();