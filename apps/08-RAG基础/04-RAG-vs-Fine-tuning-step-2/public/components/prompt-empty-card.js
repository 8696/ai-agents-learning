// 职责：左栏「空系统提示词 + RAG」卡片（受控组件）。
// 数据流：父组件传 question / data / loading / error / forceErrorLoading → 渲染按钮 + 结果。
// 「演示后端 5xx」按钮 → onRunEmptyForceError() → 父组件 fetch("/api/rag-empty", {forceError:true}) → 5xx。
// 这是 §5.3.2 #2「第二类错误」：与「空问题 400」不同的失败通道。
const PromptEmptyCard = function ({ question, data, loading, error, forceErrorLoading, onRunEmpty, onRunEmptyForceError }) {
  return (
    <section id="output-rag-empty" className="bg-white shadow rounded p-4 min-h-[200px] space-y-2">
      <div className="text-sm text-gray-500">
        左栏：空系统提示词 + RAG（system = 「你是售后客服助手。请按材料回答」 · promptVariant=empty）
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          id="run-rag-empty"
          onClick={onRunEmpty}
          disabled={loading || forceErrorLoading || !question.trim()}
          className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {loading ? "请求中…" : "跑「空系统提示词 + RAG」"}
        </button>
        <button
          id="run-rag-empty-force-error"
          onClick={onRunEmptyForceError}
          disabled={loading || forceErrorLoading || !question.trim()}
          className="border border-gray-300 px-3 py-1 rounded disabled:opacity-50 text-sm"
          title="演示第二类错误：让 /api/rag-empty 强制返回 5xx，#status-pill 变红"
        >
          {forceErrorLoading ? "请求中…" : "演示后端错误（5xx · 第二类错误）"}
        </button>
      </div>
      {error && (
        <div className="text-red-600 text-sm">
          失败：{error}
          {data === null && " —— 这是 §5.3.2 第二类错误通道（演示后端错误）"}
        </div>
      )}
      {data && (
        <div className="bg-gray-50 border border-gray-300 rounded p-3 space-y-1">
          <div className="text-xs text-gray-500">模型答复（左栏 · 灰色中性区 · 自由发挥）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{data.answer || "（空）"}</div>
          <div className="text-xs text-gray-500">
            promptVariant = {data.promptVariant} · 检索命中 {data.retrieved} 条切块 · 本栏 = 自由发挥（不加品牌口吻约定 / 不加范例）
          </div>
        </div>
      )}
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.PromptEmptyCard = PromptEmptyCard;