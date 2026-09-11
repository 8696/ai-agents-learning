/**
 * 职责：左栏。提问输入、检索生成结果。不展示库里的行。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function AskPanel(props) {
    const JsonBlock = DemoUI.JsonBlock;
    const ask = props.ask;
    const busy = props.busy;
    const noKey = props.noKey;
    return (
      <section id="ask-pane" className="bg-white shadow rounded p-4 space-y-3 min-h-[200px] border-l-4 border-blue-600 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-900">右边 · 提问（ask）</h2>
        <p className="text-xs text-gray-600">POST /api/ask。先建库。期望流程只有 embed / retrieve / generate，不再拆库。</p>
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
            onClick={function () { props.onAsk(); }}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            提问（检索 → 生成 · ask）
          </button>
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onNoMaterials(); }}
            className="border border-amber-400 text-amber-700 px-3 py-2 rounded disabled:opacity-50"
          >
            演示库里没有答案（Abstain · 强制说不知道）
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={function () { props.onEmpty(); }}
            className="border border-gray-300 px-3 py-2 rounded disabled:opacity-50"
          >
            演示空问题（4xx · 第一类错误）
          </button>
        </div>
        {!ask ? (
          <p className="text-sm text-gray-500">还没提问。左边先建库，再在这里问。</p>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
              <div className="text-xs font-semibold">请求参数 · 提问 POST /api/ask</div>
              <p className="text-xs">问题（question）：{ask.question}</p>
            </div>
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
              <div className="text-xs font-semibold">调用流程 · 提问时三步（不应再拆库）</div>
              <p className="text-xs text-gray-600">实际跑了：{(ask.stepsRan || []).join(" → ")}</p>
              <p className="text-xs text-gray-600">
                重建整库了吗（rebuiltIndex）：{String(ask.rebuiltIndex)} · 期望 false
              </p>
              <p className="text-xs text-gray-600">问题向量维数 {ask.embed.dimensions} · 模型 {ask.embed.model}</p>
              <p className="text-xs text-gray-600">约定（prefixRule）：{ask.embed.prefixRule}</p>
            </div>
            <div className={(ask.retrieval && ask.retrieval.abstained) ? "bg-amber-50 border border-amber-400 rounded p-3 space-y-1" : "bg-emerald-50 border border-emerald-300 rounded p-3 space-y-1"}>
              <div className="text-xs font-semibold">
                检索质量摘要（Retrieval Quality Summary）
                {(ask.retrieval && ask.retrieval.abstained) ? (
                  <span className="ml-2 text-amber-700">⚠ 触发弃权（Abstain）</span>
                ) : (
                  <span className="ml-2 text-emerald-700">✓ 未触发弃权</span>
                )}
              </div>
              <p className="text-xs text-gray-700">命中数（hitCount）：{ask.retrieval ? ask.retrieval.hitCount : "—"}</p>
              <p className="text-xs text-gray-700">最高分（maxScore · Top-1）：{ask.retrieval ? ask.retrieval.maxScore.toFixed(3) : "—"}</p>
              <p className="text-xs text-gray-700">阈值（threshold）：{ask.retrieval ? ask.retrieval.threshold.toFixed(3) : "—"}</p>
              <p className="text-xs text-gray-700">
                是否弃权（abstained）：{ask.retrieval && ask.retrieval.abstained ? "true · 原因 " + ask.retrieval.reason : "false · 原因 " + (ask.retrieval ? ask.retrieval.reason : "—")}
              </p>
              <p className="text-xs text-gray-600">
                {(ask.retrieval && ask.retrieval.abstained)
                  ? "→ 提示词里材料区被替换成「（无可用材料）」，system 写明「必须直接说不知道，不要编」。模型仍然被允许调用聊天接口生成「说不知道」这句话。"
                  : "→ 提示词里照常拼接 Top-K 材料，模型根据材料作答。"}
              </p>
            </div>
            <div className="bg-green-50 border border-green-300 rounded p-3 space-y-2">
              <div className="text-xs font-semibold text-green-900">响应结果 · 检索卡片 + 生成回答</div>
              <ul className="text-xs space-y-2">
                {(ask.hits || []).map(function (hit) {
                  return (
                    <li key={hit.id} className="border rounded p-2 bg-white">
                      <div>
                        分数（score）{hit.score.toFixed(3)} · {hit.source} / {hit.section}
                      </div>
                      <pre className="whitespace-pre-wrap mt-1 max-h-24 overflow-auto">{hit.text}</pre>
                    </li>
                  );
                })}
              </ul>
              <div className="text-xs text-gray-600">发给模型的提示词（Prompt）</div>
              <JsonBlock value={ask.prompt} />
              <div className="text-sm text-gray-900 whitespace-pre-wrap">{ask.answer}</div>
            </div>
          </div>
        )}
      </section>
    );
  }

  DemoUI.AskPanel = AskPanel;
  window.DemoUI = DemoUI;
})();
