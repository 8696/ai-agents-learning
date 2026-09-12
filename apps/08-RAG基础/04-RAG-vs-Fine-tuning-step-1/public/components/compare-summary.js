// 职责：对照小结卡片 + 「同时跑两栏」按钮。
// 「同时跑两栏」 = 浏览器并发 Promise.all（两条 fetch 同时发起）→ 把两份结果交给父组件。
// 这是 §5.3.8「对照拆请求」 + 「交互跟笔记走」：不是 /api/compare 一个接口同时跑多套。
const CompareSummary = function ({ question, bothLoading, bothError, onRunBoth }) {
  return (
    <section
      id="compare-summary"
      className="bg-yellow-50 border border-yellow-300 rounded p-4 space-y-2"
    >
      <div className="text-sm font-semibold text-yellow-900">本页核心教学点</div>
      <div className="text-xs text-gray-800">
        同一问句、两条独立请求：左栏「不接 RAG（model only · 无材料 · 无出处）」；右栏「检索增强生成」（命中切块 / 带出处）。
        <br />
        知识一改：左栏答的是旧的或编的；右栏答的是新的并列出文件 / 段落。
        <br />
        <span className="text-red-700">
          本页没有训练任务 —— 微调（Fine-tuning）本步不真训。
        </span>
      </div>
      <div className="text-xs text-gray-600">
        怎么观察：对照两栏的「模型答复」+ 右栏的「依据」列表；改一下输入框里的问题，能再跑一次。
      </div>
      <button
        id="run-both"
        onClick={onRunBoth}
        disabled={bothLoading || !question.trim()}
        className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
      >
        {bothLoading ? "请求中…" : "同时跑两栏（推荐 · 浏览器并发）"}
      </button>
      {bothError && <div className="text-red-600 text-sm">失败：{bothError}</div>}
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.CompareSummary = CompareSummary;