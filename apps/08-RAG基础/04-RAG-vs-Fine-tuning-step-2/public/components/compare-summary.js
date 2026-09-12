// 职责：对照小结卡片 + 「同时跑两栏」按钮。
// 「同时跑两栏」 = 浏览器并发 Promise.all（两条 fetch 同时发起）→ 把两份结果交给父组件。
// 这是 §5.3.8「对照拆请求」+ 「交互跟笔记走」：不是 /api/rag-compare 打包跑多轨迹。
const CompareSummary = function ({ question, bothLoading, bothError, onRunBoth }) {
  return (
    <section
      id="compare-summary"
      className="bg-yellow-50 border border-yellow-300 rounded p-4 space-y-2"
    >
      <div className="text-sm font-semibold text-yellow-900">本页核心教学点</div>
      <div className="text-xs text-gray-800">
        同份检索材料 + 同一模型，右栏 system 加了「品牌口吻约定 + 3 条范例」，左栏没加 —— <b>口吻差 ≠ 模型差，是 system 差</b>。
        <br />
        <span className="text-red-700">
          本页没有训练任务 —— 这是「第三条路」（改输入、不改权重），不是微调。官方建议顺序：先 system → 再 RAG → 最后 FT。
        </span>
      </div>
      <div className="text-xs text-gray-600">
        怎么观察：对照两栏的「模型答复」开头 —— 右栏是不是先道歉；中间是不是给具体结论；末尾是不是列依据。
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