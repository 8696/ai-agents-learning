/**
 * 职责：变体 7-D「库容量上限 + 自动合并」专用组件（auto-merge sub-page 用）。
 * 数据流：JSX 函数组件 → 挂在 window.DemoUI → auto-merge.html 取用。
 *
 * 组件清单：
 *   - CapacityBar: 库容量条（绿 / 黄 / 红 + 百分比 + 零碎事实计数）
 *   - AutoMergePanel: 自动合并结果面板（未合并 / 已合并两种状态）
 *
 * 与 compress-shared.js 拆开原因：compress-shared.js 加完两个组件超 250 行（§5.3.8 文件行数硬上限），按职责拆。
 */
(function () {
  const { useState } = React;
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ── 库容量状态条（变体 7-D 自动合并用） ──
  DemoUI.CapacityBar = function CapacityBar(props) {
    const s = props.state;
    if (!s) return null;
    const threshold = s.threshold;
    const exceeded = s.exceeded;
    const ratio = threshold ? Math.min(1, s.currentChars / threshold) : 0;
    const pct = Math.round(ratio * 100);
    const barColor = exceeded
      ? "bg-red-500"
      : (ratio > 0.8 ? "bg-yellow-500" : "bg-green-500");
    return (
      <div className="bg-white border rounded p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-800">库容量状态</span>
          <span className={"px-2 py-0.5 rounded font-semibold " + (exceeded ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900")}>
            {exceeded ? "❌ 已超限" : (threshold ? "✅ 未超" : "无限制")}
          </span>
        </div>
        {threshold !== null ? (
          <div className="space-y-1">
            <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
              <div className={"h-3 transition-all " + barColor} style={{ width: pct + "%" }}></div>
            </div>
            <div className="text-xs text-gray-600">
              库总字符 <b>{s.currentChars}</b> / 阈值 <b>{threshold}</b> · {pct}% · 库里共 <b>{s.factCount}</b> 条事实（零碎 <b>{s.scatterCount}</b> 条）
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-600">
            库总字符 <b>{s.currentChars}</b> · 库里共 <b>{s.factCount}</b> 条事实（零碎 <b>{s.scatterCount}</b> 条）· 还没设阈值（点下方输入框设阈值即可启用自动合并）
          </div>
        )}
      </div>
    );
  };

  // ── 自动合并结果面板（变体 7-D 自动合并用） ──
  DemoUI.AutoMergePanel = function AutoMergePanel(props) {
    const r = props.result;
    const JsonBlock = DemoUI.JsonBlock;
    if (!r) return null;
    if (!r.merged) {
      return (
        <div className="bg-white border rounded p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">写入完成 · 未触发自动合并</h3>
          <div className="text-xs text-gray-700">
            新事实已写进库。当前库总字符 <b>{r.state.currentChars}</b>，阈值 <b>{r.state.threshold ?? "不限"}</b>，超限 = <b>{String(r.state.exceeded)}</b>。
            {r.state.exceeded ? "（已超限但库里没有零碎事实可合并——库本身就是合并产物。）" : "（未超阈值，不需要合并。）"}
          </div>
        </div>
      );
    }
    return (
      <div className="bg-white border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">已自动合并</h3>
          <span className="text-xs bg-orange-100 text-orange-900 px-2 py-0.5 rounded font-semibold">
            合并 {r.mergedKeyCount} 条 → 写回 user_profile_auto · 归档 {r.archivedKeyCount ?? 0} 条
          </span>
        </div>
        <div className="text-xs text-gray-600">
          触发条件：库总字符 ≥ 阈值。被合并的零碎事实：<span className="font-mono">{JSON.stringify(r.scatterKeys)}</span>
        </div>
        <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-900">
          <b>合并后库状态变化</b>：合并前 {r.state.threshold ? r.state.currentChars : 0} 字符 → 合并后看上面 CapacityBar（被合并的零碎事已标 <code>archived_at</code>，不算容量；按笔记 §6「过期 ≠ 删除」原则，归档后召回看不见但归档视图可见）。
        </div>
        <div className="bg-blue-50 border border-blue-300 rounded p-3">
          <div className="text-xs font-semibold text-blue-900 mb-1">覆盖写回 user_profile_auto 的画像</div>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.image}</pre>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700">📄 完整流程 · 跟大模型的交互（点展开）</summary>
          <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-300">
            <div className="text-gray-600">① 自动合并调的是 mergeFactsToImage（跟手动合并同一个核心函数）</div>
            <div className="text-gray-600">② 发给大模型的完整请求体</div>
            <JsonBlock label="展开看 modelRequest 完整 JSON" data={r.modelRequest} />
            <div className="text-gray-600">③ 大模型返回的完整响应</div>
            <JsonBlock label="展开看 modelResponse 完整 JSON" data={r.modelResponse} />
          </div>
        </details>
      </div>
    );
  };

  // ── 跨会话验证 + 记忆调取预览 面板（变体 7-E 用） ──
  DemoUI.RecallPreviewPanel = function RecallPreviewPanel(props) {
    const r = props.result;
    const JsonBlock = DemoUI.JsonBlock;
    if (!r) return null;
    const m = r.materials;
    return (
      <div className="bg-white border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">跨会话验证 · 记忆被拼成 prompt + 大模型基于记忆说话</h3>
          <span className="text-xs bg-purple-100 text-purple-900 px-2 py-0.5 rounded font-semibold">
            SQLite 持久化 · 跨会话可读
          </span>
        </div>

        {/* 素材是否齐全的提示 */}
        {r.warnings && r.warnings.length > 0 ? (
          <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs text-yellow-900">
            <b>提示（{r.warnings.length} 条）</b>：
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {r.warnings.map(function (w, i) { return <li key={i}>{w}</li>; })}
            </ul>
          </div>
        ) : null}

        {/* 大模型生成的开场白 */}
        {r.opening ? (
          <div className="bg-blue-50 border border-blue-300 rounded p-3 space-y-1">
            <div className="text-xs font-semibold text-blue-900">大模型基于记忆生成的开场白</div>
            <pre className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.opening}</pre>
          </div>
        ) : null}

        {/* 拼进 prompt 的素材 */}
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700">📦 拼进 prompt 的素材（点展开看「召回链路」）</summary>
          <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-300">
            <div className="bg-gray-50 border rounded p-2">
              <div className="font-semibold text-gray-800 mb-1">【1】综合层画像（user_profile_auto.summary）</div>
              <pre className="text-xs font-mono whitespace-pre-wrap">{m.imageSummary || "（库里没有这条事实——先跑自动合并写入）"}</pre>
            </div>
            <div className="bg-gray-50 border rounded p-2">
              <div className="font-semibold text-gray-800 mb-1">【2】对话原文（chat_session_v1.value）</div>
              <pre className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto">{m.conversationOriginal || "（库里没有这条事实——先点「灌入示例」）"}</pre>
            </div>
            <div className="bg-gray-50 border rounded p-2">
              <div className="font-semibold text-gray-800 mb-1">【3】对话摘要（chat_session_v1.summary）</div>
              <pre className="text-xs font-mono whitespace-pre-wrap">{m.conversationSummary || "（没跑过 compressSession——先去 compress-session 页跑一次）"}</pre>
            </div>
          </div>
        </details>

        {/* 发给大模型的完整 messages */}
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700">📄 发给大模型的完整 messages（点展开看「system + user 长什么样」）</summary>
          <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-300">
            <JsonBlock label="展开看 modelRequest 完整 JSON" data={r.modelRequest} />
            <div className="text-gray-600">② 大模型返回的完整响应</div>
            <JsonBlock label="展开看 modelResponse 完整 JSON" data={r.modelResponse} />
          </div>
        </details>
      </div>
    );
  };
})();