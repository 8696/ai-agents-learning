// 职责：对照小结卡片 + 「同时跑两栏」按钮。
// 「同时跑两栏」 = 浏览器并发 Promise.all（两条 fetch 同时发起）→ 把两份结果交给父组件。
// 这是 §5.3.8「对照拆请求」+ 「交互跟笔记走」：不是 /api/compare 一个接口同时跑多套。
// 本步主题：幻觉 vs 弃权。
const CompareSummary = function ({ question, bothLoading, bothError, onRunBoth }) {
  return (
    <section
      id="compare-summary"
      className="bg-yellow-50 border border-yellow-300 rounded p-4 space-y-2"
    >
      <div className="text-sm font-semibold text-yellow-900">本页核心教学点</div>
      <div className="text-xs text-gray-800">
        同一道<span className="font-semibold">库里没有的题</span>、两条独立请求：左栏「不接 RAG（model only · 无材料 · 无出处）」→ 凭印象凭空编一个；右栏「检索增强生成」→ 检索 0 条 + 按 system 指令弃权（答「库里没有这条信息，我不能编」）。
        <br />
        <span className="text-red-700">
          本页没有训练任务 —— 微调（Fine-tuning）本步不真训。本步演示的是「找不到怎么说」的能力边界。
        </span>
      </div>
      <div className="text-xs text-gray-600">
        怎么观察：左栏是否编出一个具体的折扣 / 数字 / 政策；右栏是否直接说「库里没有」。
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