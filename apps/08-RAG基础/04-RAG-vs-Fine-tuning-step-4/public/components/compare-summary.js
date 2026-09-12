// 职责：对照小结卡片 + 「重新加载」 + 「演示上游失败」按钮。
// 教学点：检索增强生成 vs 微调——喂的数据完全不一样。文档段落 vs 问答对。
const CompareSummary = function ({ docsCount, qasCount, onReload, onDemoError, demoErrorLoading }) {
  return (
    <section
      id="compare-summary"
      className="bg-yellow-50 border border-yellow-300 rounded p-4 space-y-2"
    >
      <div className="text-sm font-semibold text-yellow-900">本页核心教学点</div>
      <div className="text-xs text-gray-800">
        <b>检索增强生成喂「手册 / FAQ / PDF」</b>（陈述事实的原文）；
        <b>微调喂「聊天记录 → 问答对」</b>（带口吻、带处理流程）。
        两种数据形态完全不同 —— <b>不能互相代替</b>。
      </div>
      <div className="text-xs text-gray-800">
        反例 1：把手册直接当微调数据 → 模型只学会「复述手册」，接到「我鞋子开胶」只说「按手册七天」不会道歉 / 不给流程。<br />
        反例 2：把客服聊天记录当检索文档 → 「好的亲 / 没问题亲 / 上次退过 50 块」都被检索出来当成「政策」。
      </div>
      <div className="text-xs text-gray-600">
        怎么观察：左栏每条都是「来源 / 章节 / 段落」结构；右栏每条都是「用户 + 理想答」结构 —— 喂给哪一种，文档长得就不一样。
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          id="reload-data"
          onClick={onReload}
          className="bg-blue-600 text-white px-3 py-1 rounded"
        >
          重新加载（docs={docsCount} · qas={qasCount}）
        </button>
        <button
          id="run-demo-error"
          onClick={onDemoError}
          disabled={demoErrorLoading}
          className="border border-gray-300 px-3 py-1 rounded disabled:opacity-50 text-sm"
          title="演示第二类错误：GET /api/demo-error 强制返回 5xx，#status-pill 变红"
        >
          {demoErrorLoading ? "请求中…" : "演示上游失败（5xx · 第二类错误）"}
        </button>
      </div>
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.CompareSummary = CompareSummary;