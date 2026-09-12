// 职责：左栏「文档段落」卡片（受控组件）。
// 数据流：父组件传 docs 数组 → 渲染每条「来源 / 章节 / 段落全文」卡。
// 教学点：检索增强生成喂的就是这种材料 —— 陈述事实的原文 / 无用户视角 / 无口吻 / 无问答结构。
const DocCard = function ({ docs }) {
  return (
    <section id="output-doc" className="bg-white shadow rounded p-4 min-h-[200px] space-y-3">
      <div className="text-sm text-gray-500">
        左栏：<span className="font-semibold text-blue-700">文档段落</span>（doc chunks · 陈述事实的原文）
        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
          喂给：检索增强生成（RAG）✓
        </span>
        <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
          喂给：微调（FT）✗ 不要喂这种
        </span>
      </div>
      {(!docs || docs.length === 0) && (
        <div className="text-xs text-gray-500">加载中…</div>
      )}
      <ul className="space-y-2">
        {docs && docs.map((d, i) => (
          <li key={d.docId} className="bg-blue-50 border border-blue-300 rounded p-3 space-y-1">
            <div className="text-xs text-gray-700">
              <span className="font-mono">[{i + 1}] {d.source}</span>
              <span className="mx-1 text-gray-400">/</span>
              <span className="font-mono">{d.section}</span>
              <span className="mx-1 text-gray-400">/</span>
              <span className="font-mono text-gray-500">{d.docId}</span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{d.text}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.DocCard = DocCard;