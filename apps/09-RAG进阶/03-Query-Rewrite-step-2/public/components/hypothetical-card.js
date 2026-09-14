/**
 * 职责：展示 HyDE 模型写的假想段 + 向量长度。强调"假想段是检索探针，不是客服答复"。
 * 数据流：hypothetical + hypVectorDim → 卡片。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function HypotheticalCard(props) {
    const hyp = props.hypothetical;
    const dim = props.hypVectorDim;
    if (!hyp) {
      return (
        <div className="border border-dashed border-gray-300 rounded p-2 text-xs text-gray-500">
          还没跑 HyDE。点了之后，这里展示模型写的「假想政策段」全文（只是检索探针，不展示给用户）。
        </div>
      );
    }
    return (
      <div className="border border-purple-200 bg-purple-50 rounded p-3 space-y-2">
        <div className="text-xs font-medium text-purple-900">假想政策段（hypothetical）· 仅作检索探针</div>
        <pre className="whitespace-pre-wrap text-xs text-gray-800 bg-white rounded p-2 max-h-40 overflow-auto">{hyp}</pre>
        <div className="text-xs text-purple-800">
          嵌入向量维度（dim）：<span className="font-mono">{dim}</span>（与切块维度一致）
        </div>
        <div className="text-xs text-gray-600">
          注意：这段文字不会展示给用户。它只是被嵌入后拿去和 8 个切块做余弦。写飞了 = 检索稳定打到错误类文档。
        </div>
      </div>
    );
  }

  DemoUI.HypotheticalCard = HypotheticalCard;
})();