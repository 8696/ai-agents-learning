/**
 * 职责：compress-session / compress-image 两个 sub-page 共享的可视组件（§5.3.8 拆组件）。
 * 数据流：JSX 函数组件 → 挂在 window.DemoUI → 两个 sub-page 各取所需。
 *
 * 组件清单：
 *   - JsonBlock: 折叠的 JSON 预览（点展开看完整 modelRequest / modelResponse）
 *   - FactRowCard: 单条事实卡片（含 summary 字段高亮）
 *   - LibraryPanel: 库状态面板（多条 FactRowCard 拼起来）
 *   - SessionResultPanel: 「整段 → 会话摘要」结果展示（含漏掉的细节 ❌ 标记）
 *   - ImageResultPanel: 「多条 → 画像」结果展示（亮出原始事实列表）
 */
(function () {
  const { useState } = React;
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ── 通用 JSON 折叠块 ──
  DemoUI.JsonBlock = function JsonBlock(props) {
    const [open, setOpen] = useState(true);
    const label = props.label || "查看原始 JSON";
    const data = props.data;
    let text = "";
    try { text = JSON.stringify(data, null, 2); } catch (e) { text = String(data); }
    return (
      <div className="border border-gray-200 rounded bg-gray-50">
        <button
          onClick={function () { setOpen(!open); }}
          className="w-full text-left text-xs text-gray-700 px-3 py-1 hover:bg-gray-100"
        >
          {open ? "▼" : "▶"} {label}
        </button>
        {open ? <pre className="text-xs font-mono whitespace-pre-wrap p-3 max-h-96 overflow-auto">{text}</pre> : null}
      </div>
    );
  };

  // ── 单条事实卡片 ──
  DemoUI.FactRowCard = function FactRowCard(props) {
    const f = props.fact;
    const valueStr = typeof f.value === "object" && f.value && "value" in f.value ? f.value.value : JSON.stringify(f.value);
    return (
      <div className="border border-gray-200 rounded p-3 space-y-1 bg-white">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-gray-800">{f.key}</span>
          <span className="text-xs text-gray-500">{f.value && typeof f.value === "object" && f.value.type ? f.value.type : ""}</span>
        </div>
        <div className="text-sm text-gray-700">{valueStr}</div>
        {f.summary ? (
          <div className="bg-yellow-50 border-l-2 border-yellow-400 px-2 py-1 text-xs text-gray-700">
            <b>summary（压缩结果）</b>：{f.summary}
          </div>
        ) : null}
        <div className="text-xs text-gray-500">
          入库 {f.updated_at ? f.updated_at.slice(0, 19).replace("T", " ") : ""}
          {f.last_used_at ? " · 召回过 " + f.last_used_at.slice(0, 19).replace("T", " ") : ""}
          {typeof f.use_count === "number" ? " · 用过 " + f.use_count + " 次" : ""}
          {f.importance ? " · 重要程度 " + f.importance : ""}
          {f.archived_at ? " · 已归档 " + f.archived_at.slice(0, 19).replace("T", " ") : ""}
        </div>
      </div>
    );
  };

  // ── 库状态面板 ──
  DemoUI.LibraryPanel = function LibraryPanel(props) {
    const library = props.library;
    const FactRowCard = DemoUI.FactRowCard;
    if (!library) return null;
    return (
      <div className="bg-white border rounded p-3 space-y-2">
        <div className="text-xs font-semibold text-gray-800">库里现在有 {library.length} 条事实（点展开看每条的完整字段）</div>
        <div className="space-y-2">
          {library.map(function (f) { return <FactRowCard key={f.key} fact={f} />; })}
        </div>
      </div>
    );
  };

  // ── 整段 → 会话摘要 结果面板 ──
  DemoUI.SessionResultPanel = function SessionResultPanel(props) {
    const r = props.result;
    const JsonBlock = DemoUI.JsonBlock;
    if (!r) return null;
    const summary = r.summary;
    const originalLength = r.originalLength;
    const summaryLength = r.summaryLength;
    const ratio = r.compressionRatio;

    // 「有损代价」检测：原文里包含「花生过敏」，摘要里没提到就标出来
    const originalHasPeanut = r.modelRequest && r.modelRequest.messages && r.modelRequest.messages.some(function (m) {
      return m.content && typeof m.content === "string" && m.content.indexOf("花生过敏") >= 0;
    });
    const summaryHasPeanut = summary && summary.indexOf("花生过敏") >= 0;
    const droppedPeanut = originalHasPeanut && !summaryHasPeanut;

    return (
      <div className="bg-white border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">整段 → 会话摘要 结果</h3>
          <div className="text-xs text-gray-500">
            原文 {originalLength} 字 → 摘要 {summaryLength} 字 · 压缩比 <b className="text-green-700">{ratio}</b>
          </div>
        </div>

        {droppedPeanut ? (
          <div className="bg-red-50 border border-red-300 rounded p-3 text-xs text-red-900">
            <b>❌ 这条细节在摘要里丢失了</b>：原文里你提到「<b>对花生过敏</b>」（第 7 轮），摘要里没提 — 这就是「有损压缩」的代价。再次压缩会让这类细节更容易丢。
          </div>
        ) : null}

        <div className="bg-blue-50 border border-blue-300 rounded p-3">
          <div className="text-xs font-semibold text-blue-900 mb-1">压缩后的内容（{summaryLength} 字）</div>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{summary}</pre>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700">📄 完整流程 · 跟大模型的交互（点展开）</summary>
          <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-300">
            <div className="text-gray-600">① 原文（{originalLength} 字，给大模型的输入）</div>
            <div className="bg-gray-50 border rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto">
              {r.modelRequest && r.modelRequest.messages ? r.modelRequest.messages.map(function (m) {
                return m.role + ": " + (typeof m.content === "string" ? m.content.slice(0, 200) + (m.content.length > 200 ? "...(省略)" : "") : "[多模态]");
              }).join("\n\n") : ""}
            </div>
            <div className="text-gray-600">② 发给大模型的完整请求体（含 model / temperature / response_format）</div>
            <JsonBlock label="展开看 modelRequest 完整 JSON" data={r.modelRequest} />
            <div className="text-gray-600">③ 大模型返回的完整响应（含 id / model / choices / usage）</div>
            <JsonBlock label="展开看 modelResponse 完整 JSON" data={r.modelResponse} />
          </div>
        </details>
      </div>
    );
  };

  // ── 多条 → 画像 结果面板 ──
  DemoUI.ImageResultPanel = function ImageResultPanel(props) {
    const r = props.result;
    const JsonBlock = DemoUI.JsonBlock;
    if (!r) return null;
    const image = r.image;
    const originalLength = r.originalLength;
    const imageLength = r.imageLength;
    const ratio = r.compressionRatio;
    const factCount = r.originalFacts ? r.originalFacts.length : 0;

    return (
      <div className="bg-white border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">多条 → 画像合并 结果</h3>
          <div className="text-xs text-gray-500">
            原始 {factCount} 条事实共 {originalLength} 字 → 画像 {imageLength} 字 · 压缩比 <b className="text-green-700">{ratio}</b>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-300 rounded p-3">
          <div className="text-xs font-semibold text-blue-900 mb-1">合并后的用户画像（{imageLength} 字）</div>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{image}</pre>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700">📄 完整流程 · 跟大模型的交互（点展开）</summary>
          <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-300">
            <div className="text-gray-600">① 给大模型的输入（{factCount} 条事实拼起来的字符串）</div>
            <JsonBlock label="展开看发给大模型的原文事实列表" data={r.originalFacts} />
            <div className="text-gray-600">② 发给大模型的完整请求体</div>
            <JsonBlock label="展开看 modelRequest 完整 JSON" data={r.modelRequest} />
            <div className="text-gray-600">③ 大模型返回的完整响应</div>
            <JsonBlock label="展开看 modelResponse 完整 JSON" data={r.modelResponse} />
          </div>
        </details>
      </div>
    );
  };
})();