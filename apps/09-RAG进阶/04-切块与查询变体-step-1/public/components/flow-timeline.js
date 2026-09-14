/**
 * 职责：流程跟踪面板——按时间顺序展示「每一步原始请求 + 原始响应 + 状态 + 耗时」。
 *       让学习者一眼看见完整流程：现在进行到哪一步、每步调了什么、返回了什么。
 * 数据来源（来自 props.result / props.indexStatus）：
 *   step-1：建库 / 嵌入（问句）/ 余弦排序 / 同父去重 / 调对话补全 共 5 步
 *   step-2：多路问句生成 / 建库 / 嵌入（批量 N）/ N 路余弦 / RRF 合并 / 同父去重 / 调对话补全 共 6 步
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.FlowTimelineParentChild = function FlowTimelineParentChild(props) {
    const r = props.result;
    const idx = props.indexStatus || { built: false };
    const Card = window.DemoUI.FlowStepCard;
    if (!r) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">流程跟踪 · 待执行（点「检索并生成」后这里会按步骤显示）</p>
          <Card title="1. 建库（手动触发）" status={idx.built ? "done" : "pending"}
            request={{ action: "POST /api/build-index", model: idx.embeddingModel, provider: idx.provider, childCount: 6 }}
            response={idx.built ? { built: true, childCount: idx.childCount, vectorsDim: idx.vectorsDim, buildDurationMs: idx.buildDurationMs, builtAt: idx.builtAt } : "（点页面上「建库」按钮才会执行）"}
            durationMs={idx.buildDurationMs}
            hint={idx.built ? "把 6 个子块全部转向量存到内存 Map（一次性）" : "应用启动不会自动建库——点「建库」按钮手动建一次"} />
          <Card title="2. 嵌入（问句）" status="pending" hint="检索时调一次嵌入接口算问句向量" />
          <Card title="3. 余弦排序" status="pending" hint="在已建好的向量库（6 子块向量）上跑余弦相似度" />
          <Card title="4. 同父去重" status="pending" hint="按 parentId 去重，取父块" />
          <Card title="5. 调对话补全" status="pending" hint="把父块全文塞进 messages，调 OpenAI Chat Completions" />
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">流程跟踪 · 5 步全部完成</p>
        <Card title="1. 建库（手动触发）" status={idx.built ? "done" : "pending"}
          request={{ action: "POST /api/build-index", model: idx.embeddingModel, provider: idx.provider, childCount: 6 }}
          response={idx.built ? { built: true, childCount: idx.childCount, vectorsDim: idx.vectorsDim, buildDurationMs: idx.buildDurationMs, builtAt: idx.builtAt } : "（未建库）"}
          durationMs={idx.buildDurationMs}
          hint={idx.built ? "把 6 个子块全部转向量存到内存 Map（一次性）" : "应用启动不会自动建库——点「建库」按钮手动建一次"} />
        <Card title="2. 嵌入（问句）" status="done"
          request={{ model: r.queryEmbed.model, provider: r.queryEmbed.provider, input: r.query, encoding_format: "float" }}
          response={{ vectorDim: r.queryEmbed.vectorDim, durationMs: r.queryEmbed.durationMs, firstEightDims: r.queryEmbed.firstEightDims, hint: "完整向量本地留用，未返给前端（避免响应过大）" }}
          durationMs={r.queryEmbed.durationMs}
          hint="检索时只算问句这一个向量；6 个子块的向量是建库时算好的" />
        <Card title="3. 余弦相似度排序" status="done"
          request={{ queryVecDim: r.queryEmbed.vectorDim, indexedCount: 6, topK: r.topK }}
          response={r.allChildren.map(function (c) { return { rank: c.rank, score: Number(c.score.toFixed(4)), id: c.id, parentId: c.parentId, isHit: c.isHit, title: c.title }; })}
          hint="cos = A·B / |A|·|B|，按分数降序排；topK 内的标 isHit=true" />
        <Card title="4. 同父去重 + 取父块" status="done"
          request={{ childHits: r.childHits.map(function (c) { return { id: c.id, parentId: c.parentId, score: Number(c.score.toFixed(4)) }; }) }}
          response={{ duplicateChildIdsDropped: r.duplicateChildIdsDropped, parentsFed: r.parentsFed.map(function (p) { return { id: p.id, hitChildIds: p.hitChildIds, title: p.title, textLen: p.text.length }; }) }}
          hint="按 parentId 去重，同一父亲只留一份；提示词里同一节不会重复" />
        <Card title="5. 调对话补全（OpenAI Chat Completions）" status="done"
          request={r.modelRequest} response={r.modelResponse}
          hint="把父块全文塞进 messages（system + user），模型读父块生成答复；期望 finish_reason = stop" />
      </div>
    );
  };

  DemoUI.FlowTimelineMultiQuery = function FlowTimelineMultiQuery(props) {
    const r = props.result;
    const idx = props.indexStatus || { built: false };
    const Card = window.DemoUI.FlowStepCard;
    if (!r) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">流程跟踪 · 待执行（点「多路查询」后这里会按步骤显示）</p>
          <Card title="0. 多路问句生成" status="pending" hint="模型一次返回 N 条不同说法的检索问句" />
          <Card title="1. 建库（手动触发）" status={idx.built ? "done" : "pending"}
            hint={idx.built ? "已建库" : "应用启动不会自动建库——点「建库」按钮手动建一次"} />
          <Card title="2. 嵌入（N 个问句，批量）" status="pending" hint="1 次嵌入接口调用算 N 个问句向量" />
          <Card title="3. N 路余弦排序" status="pending" hint="每路独立在已建好的向量库上跑余弦相似度" />
          <Card title="4. RRF 合并" status="pending" hint="被多路共同命中的切块往上抬" />
          <Card title="5. 同父去重 + 取父块" status="pending" />
          <Card title="6. 调对话补全" status="pending" />
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">流程跟踪 · 6 步全部完成</p>
        <Card title="0. 多路问句生成（OpenAI Chat Completions · 第 1 次模型调用）" status="done"
          request={r.queryVariantsRequest || { model: "?", messages: "（后端未返 — 看日志）" }}
          response={r.queryVariantsResponse || "（后端未返 — 看日志）"}
          hint="1 个提示词让模型返回 N 行；这 N 行大概率是同义改写（不是真不同角度）" />
        <Card title="1. 建库（手动触发）" status={idx.built ? "done" : "pending"}
          request={{ action: "POST /api/build-index", model: idx.embeddingModel, provider: idx.provider, childCount: 6 }}
          response={idx.built ? { built: true, childCount: idx.childCount, vectorsDim: idx.vectorsDim, buildDurationMs: idx.buildDurationMs, builtAt: idx.builtAt } : "（未建库）"}
          durationMs={idx.buildDurationMs}
          hint={idx.built ? "把 6 个子块全部转向量存到内存 Map（一次性）" : "应用启动不会自动建库——点「建库」按钮手动建一次"} />
        <Card title="2. 嵌入（N 个问句，批量）" status="done"
          request={{ model: r.queryVariantsEmbed.model, provider: r.queryVariantsEmbed.provider, input: r.queryVariants, encoding_format: "float" }}
          response={{ vectorDim: r.queryVariantsEmbed.vectorDim, durationMs: r.queryVariantsEmbed.durationMs, hint: "完整向量本地留用，未返给前端（避免响应过大）" }}
          durationMs={r.queryVariantsEmbed.durationMs}
          hint="1 次嵌入接口调用算 N 个问句向量（批量）" />
        <Card title="3. N 路余弦相似度排序" status="done"
          request={{ queryVecDims: r.queryVariants.map(function () { return r.queryVariantsEmbed.vectorDim; }), indexedCount: 6, topK: r.topK }}
          response={r.perQueryHits.map(function (p, idx) {
            return { route: idx + 1, query: p.query, hits: p.childHits.map(function (c) { return { rank: c.rank, score: Number(c.score.toFixed(4)), id: c.id, parentId: c.parentId }; }) };
          })}
          hint="每路独立在已建好的向量库上跑余弦相似度，本地计算不上任何接口" />
        <Card title="4. RRF 合并（Reciprocal Rank Fusion）" status="done"
          request={{ routeCount: r.perQueryHits.length, k: 60 }}
          response={r.rrfMerged.map(function (c) { return { rank: c.rank, rrfScore: Number(c.score.toFixed(4)), id: c.id, parentId: c.parentId }; })}
          hint="rrfScore(d) = Σ 1/(60 + rank_in_route)；被多路共同命中的切块往上抬" />
        <Card title="5. 同父去重 + 取父块" status="done"
          request={{ rrfMergedCount: r.rrfMerged.length }}
          response={{ duplicateChildIdsDropped: r.duplicateChildIdsDropped, parentsFed: r.parentsFed.map(function (p) { return { id: p.id, hitChildIds: p.hitChildIds, title: p.title, textLen: p.text.length }; }) }}
          hint="按 parentId 去重，同一父亲只留一份" />
        <Card title="6. 调对话补全（OpenAI Chat Completions · 第 2 次模型调用）" status="done"
          request={r.modelRequest} response={r.modelResponse}
          hint="把 RRF 合并 + 去重后的父块塞进 messages，模型读父块生成答复；期望 finish_reason = stop" />
      </div>
    );
  };
})();