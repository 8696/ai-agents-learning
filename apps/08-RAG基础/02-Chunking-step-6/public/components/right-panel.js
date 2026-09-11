/**
 * 职责：右栏专用组件（FAQ 切）——自带「文档来源说明」卡片，演示「库长什么样是上游的离线活」。
 * 挂 window.DemoUI.RightPanel。
 *
 * 为什么单独成文件：右栏多了「文档来源」教学注解，形态跟中栏 Panel 不一样；按
 * §5.3.8「对照同页，每侧拆组件」独立成文件，避免 chunk-panels.js 超 250 行上限。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function RightPanel(props) {
    const { running, result, error, onRun } = props;
    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">右：FAQ 切（一问一答）</h2>
          <button
            type="button"
            disabled={running}
            onClick={onRun}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            跑 FAQ 切
          </button>
        </div>
        <p className="text-xs text-gray-500">每块自洽 → overlap = 0 也合理（无需滑块）。</p>
        <p className="text-xs text-gray-500">点这一栏的按钮会调 POST /api/chunk/faq；文档固定为 FAQ 格式样例。</p>
        <div className="border border-gray-300 bg-gray-50 rounded p-2 space-y-1">
          <div className="text-xs font-semibold text-gray-700">这份 FAQ 文档从哪来？</div>
          <ul className="text-xs text-gray-700 list-disc pl-5 space-y-1">
            <li>
              <b>客服手写 / 政策条款</b>——结构已经整齐，<b>不调模型</b>，直接喂给 chunkByFaq。
            </li>
            <li>
              <b>客服对话历史 / 长政策文</b>——<b>离线</b>调 LLM 整理成「一问一答」清单，<b>人工校对</b>这一步不能省，再写进库。
            </li>
            <li>
              <b>连续散文</b>（用户邮件）——<b>不</b>强求整理成 FAQ，按结构切就够；强行整理反而把语义改坏。
            </li>
          </ul>
          <div className="text-xs text-gray-600 pt-1">
            ⚠ <b>不在请求路径上</b>让模型整理——库长什么样是上游的离线活，不是用户问问题时顺手做的。
          </div>
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
                result.chunks.map(function (c) { return <ChunkCard key={c.index} chunk={c} />; })
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">点「跑 FAQ 切」看固定样例切成几块。</p>
        )}
      </section>
    );
  }

  DemoUI.RightPanel = RightPanel;
  window.DemoUI = DemoUI;
})();