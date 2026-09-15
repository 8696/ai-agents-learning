/**
 * 职责：流水线「输出」栏的渲染。真正发给模型的 system 以 finalMessages[0] 为准，不在前端再拼一遍。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.ProgramRuleList = function (props) {
    const rules = props.rules || [];
    const fragment = DemoUI.buildProgramFragment(rules);
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">↓ 程序性规则（每次请求都带同样这一段）：</p>
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
        <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
      </div>
    );
  };

  DemoUI.CoreProfileFragment = function (props) {
    const lastResult = props.lastResult || null;
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求）</p>;
    const facts = lastResult.coreProfile || [];
    const fragment = DemoUI.buildCoreProfileFragment(facts);
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">
          ↓ 核心用户画像（语义记忆 · 长期）。问 B 时这一块仍在，不会被本轮情景 Top-K 换掉。
        </p>
        {facts.length === 0 ? (
          <p className="text-amber-700 text-xs">（空 —— 事实库没有语义长期条目，或页面勾了「不注入核心用户画像」）</p>
        ) : (
          <ul className="space-y-1">
            {facts.map(function (f) {
              return (
                <li key={f.key} className="border border-indigo-200 bg-indigo-50 rounded p-1 text-xs">
                  <span className="font-mono">{f.key}</span>
                  <p className="text-gray-800">{f.sentence}</p>
                </li>
              );
            })}
          </ul>
        )}
        <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
      </div>
    );
  };

  DemoUI.RecallSystemFragment = function (props) {
    const lastResult = props.lastResult || null;
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求）</p>;
    const recall = lastResult.recall || {};
    const fragment = DemoUI.buildRecallFragment(recall);
    if (recall.skipped) {
      return (
        <div className="space-y-1">
          <p className="text-amber-700 text-xs">本轮跳过情景召回：{recall.skipReason || "未说明原因"}</p>
          <p className="text-xs text-gray-600">核心用户画像仍在 ②，不会因为跳过情景检索而消失。</p>
          <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
        </div>
      );
    }
    const topK = recall.topK || [];
    if (topK.length === 0) {
      const rejected = recall.thresholdRejection;
      return (
        <div className="space-y-1">
                <p className="text-amber-700 text-xs">
            （本轮经历为空
            {rejected ? " —— 阈值弃权：Top-1=" + rejected.topScore.toFixed(4) + " < " + rejected.threshold : ""}）
          </p>
          <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">↓ 本轮情景 Top-K={topK.length}（只活在这一次请求，下一问整块替换）：</p>
        <ol className="space-y-1">
          {topK.map(function (s, i) {
            return (
              <li key={s.fact.key} className="border border-blue-200 bg-blue-50 rounded p-1 text-xs">
                <span className="font-mono">Top-{i + 1}</span> · 余弦{" "}
                <code className="bg-white px-1 rounded">{s.score.toFixed(4)}</code>
                <p className="text-gray-800">{s.fact.sentence}</p>
              </li>
            );
          })}
        </ol>
        <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap text-gray-700">{fragment}</pre>
      </div>
    );
  };

  DemoUI.ModelCallOutput = function (props) {
    const lastResult = props.lastResult || null;
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求）</p>;
    const systemMsg = (lastResult.finalMessages || []).find(function (m) {
      return m.role === "system";
    });
    const systemContent = systemMsg ? systemMsg.content : "（这次请求的 messages 里没有 system）";
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-600">
          ↓ 这次真正发给模型的 system 段（messages[0]，来自这次请求，不是前端再拼的）：
        </p>
        <pre className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs whitespace-pre-wrap text-gray-800 max-h-48 overflow-auto">
          {systemContent}
        </pre>
        <p className="text-xs text-gray-600">↓ 模型回答：</p>
        <p className="border border-green-300 bg-green-50 rounded p-2 text-xs whitespace-pre-wrap text-gray-800">
          {lastResult.modelAnswer}
        </p>
      </div>
    );
  };

  DemoUI.HistoryOutput = function (props) {
    const lastResult = props.lastResult || null;
    if (!lastResult) return <p className="text-gray-500 text-xs">（还没发请求）</p>;
    const msgs = (lastResult.finalMessages || []).filter(function (m) {
      return m.role !== "system";
    });
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">↓ 多轮 user / assistant（工作记忆；system 已在调模型那一步展示）：</p>
        {msgs.length === 0 ? (
          <p className="text-xs text-gray-500">（这是会话最开始）</p>
        ) : (
          <ol className="space-y-1">
            {msgs.map(function (m, i) {
              const tone = m.role === "user" ? "border-blue-300 bg-blue-50" : "border-green-300 bg-green-50";
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
