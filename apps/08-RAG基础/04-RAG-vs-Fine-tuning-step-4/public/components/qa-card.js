// 职责：右栏「客服问答对」卡片（受控组件）。
// 数据流：父组件传 qas 数组 → 渲染每条「用户问 + 理想答」卡。
// 教学点：微调喂的就是这种数据 —— 用户原话 + 理想答成对 / 带口吻 / 有角色。
const QaCard = function ({ qas }) {
  return (
    <section id="output-qa" className="bg-white shadow rounded p-4 min-h-[200px] space-y-3">
      <div className="text-sm text-gray-500">
        右栏：<span className="font-semibold text-green-700">客服问答对</span>（qa pairs · 用户原话 + 理想答）
        <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
          喂给：微调（FT）✓
        </span>
        <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
          喂给：检索增强生成（RAG）✗ 不要喂这种
        </span>
      </div>
      {(!qas || qas.length === 0) && (
        <div className="text-xs text-gray-500">加载中…</div>
      )}
      <ul className="space-y-2">
        {qas && qas.map((q, i) => (
          <li key={q.qaId} className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
            <div className="text-xs text-gray-700">
              <span className="font-mono">[{i + 1}] {q.qaId}</span>
              <span className="ml-2 text-gray-400">· 喂给</span>
              <span className="ml-1 px-1 text-xs bg-green-200 text-green-800 rounded">微调</span>
            </div>
            <div className="text-sm">
              <span className="text-xs text-gray-500">用户：</span>
              <span className="text-gray-800 whitespace-pre-wrap">{q.user}</span>
            </div>
            <div className="text-sm">
              <span className="text-xs text-gray-500">理想答：</span>
              <span className="text-gray-800 whitespace-pre-wrap">{q.assistant}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

window.DemoUI = window.DemoUI || {};
window.DemoUI.QaCard = QaCard;