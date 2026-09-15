/**
 * 职责：4 步流水线的「输出」段渲染组件（独立成文件以拆 HTML ≤400 行硬上限）。
 *
 * 谁在用：index.html 主页面直接渲染这 4 个组件，传入 props 即可。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ① 程序性片段：固定文本（每次请求都带同样这一段）
  DemoUI.ProgramRuleList = function (props) {
    const rules = props.rules || [];
    const fragment = DemoUI.buildProgramFragment(rules);
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">↓ 程序性规则列表（这就是「程序性记忆」）：</p>
        {rules.length === 0 ? (
          <p className="text-xs text-yellow-700">（暂无规则）</p>
        ) : (
          <ul className="space-y-1">
            {rules.map(function (r) {
              return (
                <li key={r.id} className="flex items-start gap-1">
                  <span className="font-mono text-yellow-700">#{r.id}</span>
                  <span className="flex-1 text-gray-800">{r.text}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-gray-600 mt-1">↓ 拼进 system 段开头的固定文本片段（每次请求都带同样这一段）：</p>
        <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
      </div>
    );
  };

  // ② 召回片段：动态文本（每次按当前 user 重算）
  DemoUI.RecallSystemFragment = function (props) {
    const lastResult = props.lastResult || null;
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求 —— 点例句按钮或「发一条」）</p>;
    const recall = lastResult.recall || {};
    const fragment = DemoUI.buildRecallFragment(recall);
    if (recall.skipped) {
      return (
        <div className="space-y-1">
          <p className="text-amber-700 text-xs">⏭ 跳过（前端勾了 skipRecall）—— 不调嵌入、不算余弦</p>
          <p className="text-xs text-gray-600">→ 拼进 system 段的动态部分就是这一行：</p>
          <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
        </div>
      );
    }
    const topK = recall.topK || [];
    if (topK.length === 0) {
      const rejected = recall.thresholdRejection;
      return (
        <div className="space-y-1">
          <p className="text-amber-700 text-xs">（Top-K 为空 —— 阈值弃权：{rejected ? "Top-1=" + rejected.topScore.toFixed(4) + " < " + rejected.threshold : ""}）</p>
          <p className="text-xs text-gray-600">→ 拼进 system 段的动态部分就是这一行：</p>
          <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">↓ 召回的 Top-K={topK.length}（动态部分 · 每次按当前 user 重算）：</p>
        <ol className="space-y-1">
          {topK.map(function (s, i) {
            return (
              <li key={s.fact.key} className="border border-blue-200 bg-blue-50 rounded p-1 text-xs">
                <span className="font-mono">Top-{i + 1}</span> · <span className="font-mono">{s.fact.memoryType}</span> · 余弦 <code className="bg-white px-1 rounded">{s.score.toFixed(4)}</code>
                <p className="text-gray-800">{s.fact.sentence}</p>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-gray-600 mt-1">↓ 上面 Top-K 转成 system 段里的实际文本片段（动态部分）：</p>
        <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
      </div>
    );
  };

  // ③ 调模型列的输出：完整 system 段文本（固定 + 动态 + 行为约定）+ 模型最终回答
  DemoUI.ModelCallOutput = function (props) {
    const lastResult = props.lastResult || null;
    const rules = props.rules || [];
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求）</p>;
    const systemContent = DemoUI.buildSystemContent(rules, lastResult.recall);
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-600">↓ 完整 system 段（①固定 + ②动态 + 行为约定三块拼成 · 这次发给模型）：</p>
        <pre className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs whitespace-pre-wrap text-gray-800 max-h-48 overflow-auto">{systemContent}</pre>
        <p className="text-xs text-gray-600">↓ 模型回答：</p>
        <p className="border border-green-300 bg-green-50 rounded p-2 text-xs whitespace-pre-wrap text-gray-800">
          {lastResult.modelAnswer}
        </p>
      </div>
    );
  };

  // ④ 工作记忆累积列的输出：只展示 messages 数组里的 user/assistant 轮次（系统设定已经在 ③ 列展示过）
  DemoUI.HistoryOutput = function (props) {
    const lastResult = props.lastResult || null;
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求）</p>;
    const msgs = (lastResult.finalMessages || []).filter(function (m) { return m.role !== "system"; });
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">↓ 多轮 user/assistant 轮次（系统设定已在 ③ 列展示，这里只显示对话历史）：</p>
        {msgs.length === 0 ? (
          <p className="text-xs text-gray-500">（这是会话最开始，messages 里只有这次请求的 user + assistant）</p>
        ) : (
          <ol className="space-y-1">
            {msgs.map(function (m, i) {
              const tone = m.role === "user"
                ? "border-blue-300 bg-blue-50"
                : "border-green-300 bg-green-50";
              return (
                <li key={i} className={"border rounded p-2 " + tone}>
                  <p className="font-mono text-xs">[{m.role}] 第 {i + 1} 条</p>
                  <pre className="whitespace-pre-wrap text-gray-800 mt-1 text-xs leading-snug">{m.content}</pre>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  };
})();