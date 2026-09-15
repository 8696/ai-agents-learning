/**
 * 职责：一次请求的拼装流水线（输入 / 做了什么 / 输出）。
 * 数据流：lastResult + programRules → ①程序性 ②核心画像 ③本轮经历 ④工作记忆 ⑤调模型。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.PipelineBoard = function PipelineBoard(props) {
    const lastResult = props.lastResult;
    const programRules = props.programRules || [];
    const queryLabel = lastResult ? "「" + lastResult.query + "」" : "（还没发请求）";
    const poolCount =
      lastResult && lastResult.recall && lastResult.recall.pool
        ? lastResult.recall.pool.facts.length
        : "?";
    const skipped = lastResult && lastResult.recall && lastResult.recall.skipped;
    const skipReason =
      lastResult && lastResult.recall && lastResult.recall.skipReason
        ? lastResult.recall.skipReason
        : "";
    const didEpisodes = skipped
      ? "跳过情景检索：" + (skipReason || "未说明原因") + "。核心画像仍常驻。"
      : "只对情景记忆做 embedBatch → 余弦 → Top-K(3) → 阈值 0.10。语义画像不进候选池。";

    return (
      <div className="bg-white shadow rounded p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">
          一次请求怎么拼 · {lastResult ? "最近一次发问" + queryLabel : "（还没发请求）"}
        </p>
        <p className="text-xs text-gray-600">
          数据从上往下流。② 核心画像每轮整份带上；③ 本轮经历按问句替换，不追加进对话历史。
        </p>
        <div className="space-y-3">
          <div className="border-2 border-gray-400 bg-white rounded p-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">0 · 当前用户消息（流水线入口）</p>
            {lastResult ? (
              <p className="border border-blue-300 bg-blue-50 rounded p-2 text-sm whitespace-pre-wrap text-gray-800">
                {queryLabel}
              </p>
            ) : (
              <p className="text-xs text-gray-500">（点上方例句或「发一条」开始）</p>
            )}
          </div>
          <DemoUI.PipelineStep
            tone="border-yellow-300 bg-yellow-50"
            icon="①"
            title="程序性记忆（常驻，不检索）"
            inputText="从内存读出全部全员规则"
            didText="写入这一次请求的系统设定区（system）。问句对不上规则原文，所以不能靠嵌入召回。"
            outputLabel="输出（写入 system，即 messages 数组第 1 条里的「全员规则」章）"
            output={<DemoUI.ProgramRuleList rules={programRules} />}
          />
          <DemoUI.PipelineStep
            tone="border-indigo-300 bg-indigo-50"
            icon="②"
            title="核心用户画像（语义记忆 · 长期 · 常驻）"
            inputText="事实库里 memoryType=语义记忆 且 term=长期 的全部条目"
            didText="同样写入这一次的 system，紧接在全员规则后面。不按当前问句筛。"
            outputLabel="输出（写入 system 里的「用户画像」章；不是另开一条 message）"
            output={<DemoUI.CoreProfileFragment lastResult={lastResult} />}
          />
          <DemoUI.PipelineStep
            tone="border-blue-300 bg-blue-50"
            icon="③"
            title="本轮相关经历（情景记忆 · 按问句召回）"
            inputText={lastResult ? "当前问句" + queryLabel + " + 情景候选 " + poolCount + " 条" : "（还没发请求）"}
            didText={lastResult ? didEpisodes + " 召回结果写入这一次 system 的「本轮经历」章，下一问整章替换。" : "（还没发请求）"}
            outputLabel="输出（写入 system 里的「本轮经历」章；下一问整章替换，不追加）"
            output={<DemoUI.RecallSystemFragment lastResult={lastResult} />}
          />
          <DemoUI.PipelineStep
            tone="border-purple-300 bg-purple-50"
            icon="④"
            title="工作记忆（对话历史，累积不替换）"
            inputText={lastResult ? "历史 user / assistant + 当前问句" : "（还没发请求）"}
            didText="这些话不写进 system。接到 messages 数组里 system 那一条的后面，角色（role）是 user / assistant。"
            outputLabel="输出（对话历史，在 system 后面；不是写进 system 正文）"
            output={<DemoUI.HistoryOutput lastResult={lastResult} />}
          />
          <DemoUI.PipelineStep
            tone="border-green-300 bg-green-50"
            icon="⑤"
            title="调对话模型（真发网络请求）"
            inputText={lastResult ? "完整消息列表（messages）= 第 1 条 system（①②③）+ 后面的对话历史（④）" : "（还没发请求）"}
            didText="llm.openai.chat.completions.create({ model, messages, temperature: 0 })"
            outputLabel="输出（这次完整发给模型的消息列表 messages）"
            output={<DemoUI.ModelCallOutput lastResult={lastResult} />}
          />
        </div>
        {props.errorText ? <p className="text-xs text-red-700">错误：{props.errorText}</p> : null}
      </div>
    );
  };
})();
