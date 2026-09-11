/**
 * 职责：右栏。agent 循环聊天面板：输入问题 → 跑 agent → 按轮显示轨迹（哪轮调了 tool / 调了什么 / 最终答案）。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function AgentPanel(props) {
    const busy = props.busy;
    const noKey = props.noKey;
    const result = props.result;
    return (
      <section id="agent-pane" className="bg-white shadow rounded p-4 space-y-3 min-h-[200px] border-l-4 border-blue-700 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-900">右边 · Agent 循环（检索做成工具）</h2>
        <p className="text-xs text-gray-600">
          POST /api/agent-run。模型自己决定要不要调 search_knowledge 工具 —— 闲聊不调，问政策才调。
        </p>
        <label className="block text-sm">
          用户问题（question）
          <input
            className="mt-1 w-full border rounded px-2 py-1"
            value={props.question}
            onChange={function (e) { props.onQuestionChange(e.target.value); }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onRun(); }}
            className="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            跑 agent（最多 3 轮）
          </button>
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onPreset("chitchat"); }}
            className="border border-gray-300 px-3 py-2 rounded disabled:opacity-50"
          >
            演示闲聊（不该调搜索）
          </button>
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onPreset("policy"); }}
            className="border border-gray-300 px-3 py-2 rounded disabled:opacity-50"
          >
            演示问政策（应该调一次搜索）
          </button>
        </div>
        {!result ? (
          <p className="text-sm text-gray-500">还没跑 agent。左边先建库（让库里有内容），再在这里问。</p>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
              <div className="text-xs font-semibold">请求参数 · POST /api/agent-run</div>
              <p className="text-xs">问题（question）：{result.question}</p>
            </div>
            <div className="border border-gray-300 bg-white rounded p-3 space-y-2">
              <div className="text-xs font-semibold">调用流程 · agent 循环轨迹（共 {result.totalRounds} 轮，调 {result.searchCount} 次搜索）</div>
              {(result.rounds || []).map(function (round) {
                return (
                  <div key={round.round} className="border-l-2 border-blue-300 pl-3 space-y-1">
                    <div className="text-xs font-semibold text-blue-900">第 {round.round} 轮</div>
                    {round.assistantContent ? (
                      <div className="text-xs text-gray-700">assistant 说：{round.assistantContent}</div>
                    ) : null}
                    {round.toolCalls.length === 0 ? (
                      <div className="text-xs text-green-700">✓ 模型决定不调工具 → 给出最终答案</div>
                    ) : null}
                    {round.toolCalls.map(function (call, idx) {
                      return (
                        <div key={idx} className="bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                          <div className="text-xs font-semibold text-amber-900">
                            🔧 调工具：{call.name}
                          </div>
                          <div className="text-xs text-gray-700">
                            参数：<code>{JSON.stringify(call.args)}</code>
                          </div>
                          <div className="text-xs text-gray-700">
                            返回：{call.result.hitCount} 条命中，最高分 {call.result.maxScore?.toFixed(3)}
                          </div>
                          <ul className="text-xs text-gray-600 list-disc pl-5">
                            {(call.result.hits || []).map(function (h, hi) {
                              return (
                                <li key={hi}>
                                  {h.source} / {h.section} · 分数 {h.score.toFixed(3)} ·{" "}
                                  <span className="text-gray-500">{h.text.slice(0, 80)}…</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
              <div className="text-xs font-semibold text-green-900">最终答案</div>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{result.finalAnswer}</p>
            </div>
          </div>
        )}
      </section>
    );
  }

  DemoUI.AgentPanel = AgentPanel;
  window.DemoUI = DemoUI;
})();