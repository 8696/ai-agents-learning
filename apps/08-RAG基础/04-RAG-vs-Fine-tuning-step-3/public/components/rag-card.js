// 职责：右栏「检索增强生成」卡片（受控组件）。
// 数据流：父组件传 question / data / loading / error → 渲染按钮 + reply + 来源列表。
// 单跑 / 同时跑：与 NoRagCard 同模式 —— 父组件统一管 fetch，卡片只渲染。
const RagCard = function ({ question, data, loading, error, onRunRag }) {
  const sources = data?.sources ?? [];
  return (
    <section id="output-rag" className="bg-white shadow rounded p-4 min-h-[200px] space-y-2">
      <div className="text-sm text-gray-500">
        右栏：检索增强生成（RAG · 从库里取材料 · 带出处）
      </div>
      <button
        id="run-rag"
        onClick={onRunRag}
        disabled={loading || !question.trim()}
        className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
      >
        {loading ? "请求中…" : "跑「检索增强生成」"}
      </button>
      {error && <div className="text-red-600 text-sm">失败：{error}</div>}
      {data && (
        <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
          <div className="text-xs text-gray-500">模型答复（右栏 · 绿系强调）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{data.answer || "（空）"}</div>
        </div>
      )}
      {sources.length > 0 && (
        <div className="border border-gray-300 rounded p-3 space-y-1">
          <div className="text-xs text-gray-500">
            依据（命中 {data.retrieved ?? sources.length} 条切块，按相关度排序）
          </div>
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
window.DemoUI.RagCard = RagCard;