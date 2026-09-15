/**
 * 职责：候选清单 + 调用流程步骤渲染。
 * 数据流：纯渲染组件；父组件传 candidates / steps 数组进来，本组件按 §5.3.10 / §5.3.11 规范 UI 样式。
 *
 * 为什么单独成文件：index.html ≤400 行硬上限；这些组件若塞进内联块会爆上限。
 *
 * 两个组件：
 *   - CandidateList({ candidates, fromText? })  渲染一组候选事实（每条 key/value/type/confidence/source/validUntil）
 *   - FlowSteps({ steps })                       渲染一组调用流程步骤（每步 label/status/detail）
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ── 单条候选卡片（key/value/type/confidence/source/validUntil 全部展示）──
  function CandidateCard(props) {
    const c = props.candidate;
    const idx = props.idx;
    const typeCls =
      c.type === "语义记忆"
        ? "bg-blue-100 text-blue-900"
        : "bg-purple-100 text-purple-900";
    return (
      <div className="border border-gray-200 rounded p-3 space-y-1 bg-gray-50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">候选 #{idx + 1}</span>
          <span className={"text-xs px-2 py-0.5 rounded font-semibold " + typeCls}>{c.type}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div>
            <span className="text-gray-500">key（键）：</span>
            <span className="font-mono font-semibold text-gray-800">{c.key}</span>
          </div>
          <div>
            <span className="text-gray-500">value（事实正文）：</span>
            <span className="text-gray-800">{c.value}</span>
          </div>
          <div>
            <span className="text-gray-500">confidence（置信度）：</span>
            <span className="font-mono">{Number(c.confidence).toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-500">source（来源）：</span>
            <span className="text-gray-700">{c.source}</span>
          </div>
          <div className="md:col-span-2">
            <span className="text-gray-500">validUntil（有效期）：</span>
            <span className="font-mono">{c.validUntil || "(null · 永不过期)"}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── 候选清单（支持 fromText 标来源，用于 flush 多段 text 时显示每段抽了什么） ──
  DemoUI.CandidateList = function CandidateList(props) {
    const list = props.candidates || [];
    if (list.length === 0) {
      return (
        <div className="text-xs text-gray-500 italic">本段未抽出任何候选（原文里没有可抽取的事实）</div>
      );
    }
    return (
      <div className="space-y-2">
        {props.fromText ? (
          <div className="text-xs text-gray-500">
            来源原文：<span className="font-mono text-gray-700">{props.fromText}</span>
          </div>
        ) : null}
        {list.map(function (c, i) {
          return <CandidateCard key={c.key + "-" + i} idx={i} candidate={c} />;
        })}
      </div>
    );
  };

  // ── 候选清单容器（多段，如 flush） ──
  DemoUI.FlushedCandidateList = function FlushedCandidateList(props) {
    const groups = props.groups || [];
    if (groups.length === 0) {
      return <div className="text-xs text-gray-500 italic">待结算队列为空，没有抽取结果</div>;
    }
    return (
      <div className="space-y-4">
        {groups.map(function (g, gi) {
          return (
            <div key={gi} className="space-y-2">
              <div className="text-xs text-gray-700 font-semibold">
                待结算段 #{gi + 1} · 抽到 {g.candidates.length} 条
              </div>
              <DemoUI.CandidateList candidates={g.candidates} fromText={g.text} />
            </div>
          );
        })}
      </div>
    );
  };

  // ── 调用流程步骤（每步 label/status/detail） ──
  DemoUI.FlowSteps = function FlowSteps(props) {
    const steps = props.steps || [];
    if (steps.length === 0) return null;
    return (
      <ol className="text-xs space-y-2">
        {steps.map(function (s, i) {
          const dotCls = s.status === "ok" ? "bg-green-500" : "bg-yellow-500";
          return (
            <li key={i} className="flex gap-2">
              <span className={"w-2 h-2 rounded-full mt-1.5 flex-shrink-0 " + dotCls} />
              <div>
                <div className="text-gray-800">{s.label}</div>
                {s.detail ? <div className="text-gray-500">{s.detail}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    );
  };

  // ── 请求参数区（灰底 · 中性） ──
  DemoUI.RequestParams = function RequestParams(props) {
    const p = props.params || {};
    return (
      <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-1 text-xs">
        <div className="text-gray-600 font-semibold">请求参数</div>
        <div>
          <span className="text-gray-500">mode（触发方式）：</span>
          <span className="font-mono">{p.mode || "(未指定)"}</span>
        </div>
        <div>
          <span className="text-gray-500">conversationId（会话 id）：</span>
          <span className="font-mono">{p.conversationId || "(未指定)"}</span>
        </div>
        <div>
          <span className="text-gray-500">text（用户原话）：</span>
          <div className="font-mono whitespace-pre-wrap text-gray-700 mt-0.5">{p.text || "(空)"}</div>
        </div>
      </div>
    );
  };
})();
