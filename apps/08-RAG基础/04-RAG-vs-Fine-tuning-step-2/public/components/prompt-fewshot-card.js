// 职责：右栏「带 3 条品牌范例 + RAG」卡片（受控组件）。
// 数据流：父组件传 question / data / loading / error / forceErrorLoading → 渲染按钮 + 结果。
// 单跑：用户点按钮 → onRunFewshot() → 父组件去 fetch("/api/rag-fewshot", {promptVariant: "fewshot"})。
// 教学点：右栏与左栏对照 = 同一份检索材料 + 同一问句；差异 = system 是否含品牌口吻约定 + 3 条范例。
// 「演示后端 5xx」按钮 → onRunFewshotForceError() → 父组件 fetch("/api/rag-fewshot", {forceError:true}) → 5xx。
const PromptFewshotCard = function ({ question, data, loading, error, forceErrorLoading, onRunFewshot, onRunFewshotForceError }) {
  const sources = data?.sources ?? [];
  return (
    <section id="output-rag-fewshot" className="bg-white shadow rounded p-4 min-h-[200px] space-y-2">
      <div className="text-sm text-gray-500">
        右栏：带 3 条品牌范例 + RAG（system = 品牌口吻约定 + 3 条范例 + 材料 · promptVariant=fewshot）
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          id="run-rag-fewshot"
          onClick={onRunFewshot}
          disabled={loading || forceErrorLoading || !question.trim()}
          className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {loading ? "请求中…" : "跑「带 3 条品牌范例 + RAG」"}
        </button>
        <button
          id="run-rag-fewshot-force-error"
          onClick={onRunFewshotForceError}
          disabled={loading || forceErrorLoading || !question.trim()}
          className="border border-gray-300 px-3 py-1 rounded disabled:opacity-50 text-sm"
          title="演示第二类错误：让 /api/rag-fewshot 强制返回 5xx，#status-pill 变红"
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
        <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
          <div className="text-xs text-gray-500">模型答复（右栏 · 绿系强调 · 范例口吻）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{data.answer || "（空）"}</div>
          <div className="text-xs text-gray-500">
            promptVariant = {data.promptVariant} · 检索命中 {data.retrieved} 条切块 · 本栏 = 范例口吻（先道歉、再结论、再依据）
          </div>
        </div>
      )}
      {sources.length > 0 && (
        <div className="border border-gray-300 rounded p-3 space-y-1">
          <div className="text-xs text-gray-500">依据（命中 {data.retrieved ?? sources.length} 条切块）</div>
          <ul className="text-xs space-y-1">
            {sources.map((s, i) => (
              <li key={s.chunkId} className="bg-gray-50 rounded p-2">
                <div className="text-gray-700">
                  [{i + 1}] {s.source} / {s.section} / {s.chunkId}（相关度 {s.score}）
                </div>
                <div className="text-gray-500 whitespace-pre-wrap">{s.preview}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.PromptFewshotCard = PromptFewshotCard;