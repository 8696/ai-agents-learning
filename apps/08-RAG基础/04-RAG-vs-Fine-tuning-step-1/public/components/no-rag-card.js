// 职责：左栏「只靠模型」卡片（受控组件）。
// 数据流：父组件传 question / data / loading / error / forceErrorLoading → 渲染按钮 + 结果。
// 「演示上游失败」按钮 → onRunNoRag(true) → 父组件 fetch("/api/no-rag", {forceError:true}) → 5xx。
// 这是 §5.3.2 #2「第二类错误」：与「空问题 400」不同的失败通道。
const NoRagCard = function ({ question, data, loading, error, forceErrorLoading, onRunNoRag, onRunForceError }) {
  return (
    <section id="output-no-rag" className="bg-white shadow rounded p-4 min-h-[200px] space-y-2">
      <div className="text-sm text-gray-500">
        左栏：只靠模型（model only · 无材料 · 无出处）
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          id="run-no-rag"
          onClick={() => onRunNoRag(false)}
          disabled={loading || forceErrorLoading || !question.trim()}
          className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {loading ? "请求中…" : "跑「只靠模型」"}
        </button>
        <button
          id="run-no-rag-force-error"
          onClick={() => onRunForceError()}
          disabled={loading || forceErrorLoading || !question.trim()}
          className="border border-gray-300 px-3 py-1 rounded disabled:opacity-50 text-sm"
          title="演示第二类错误：让 /api/no-rag 强制返回 5xx，#status-pill 变红"
        >
          {forceErrorLoading ? "请求中…" : "演示上游失败（5xx · 第二类错误）"}
        </button>
      </div>
      {error && (
        <div className="text-red-600 text-sm">
          失败：{error}
          {data === null && " —— 这是 §5.3.2 第二类错误通道（演示上游失败）"}
        </div>
      )}
      {data && (
        <div className="bg-gray-50 border border-gray-300 rounded p-3 space-y-1">
          <div className="text-xs text-gray-500">模型答复（左栏 · 灰色中性区）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{data.answer || "（空）"}</div>
          <div className="text-xs text-red-700">
            依据：无 —— 这一栏没接材料，看模型训练时的常识 / 印象
            （说七天 = 训练截止前的旧常识，不是编的）
          </div>
        </div>
      )}
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.NoRagCard = NoRagCard;