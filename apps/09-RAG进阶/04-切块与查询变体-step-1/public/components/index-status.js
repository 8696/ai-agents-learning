/**
 * 职责：在页面顶部显示「向量库状态」卡，让学习者一眼看见「建库这一步」到底建了啥。
 * 数据流：props.status（IndexStatus）→ 高对比色块；未建时显示「未建库」并提示点按钮。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.IndexStatus = function IndexStatus(props) {
    const status = props.status || { built: false, childCount: 0, vectorsDim: 0 };
    if (!status.built) {
      return (
        <div
          id="index-status"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1"
        >
          <p className="text-sm font-semibold text-yellow-900">向量库状态（Vector Index）· 未建库</p>
          <p className="text-xs text-yellow-800">
            应用启动时不会自动建库——点页面上「建库」按钮手动建一次，把 6 个子块正文都变成向量存到内存里。建好之后才能检索。
          </p>
        </div>
      );
    }
    return (
      <div
        id="index-status"
        className="bg-blue-50 border border-blue-300 rounded p-3 space-y-1"
      >
        <p className="text-sm font-semibold text-blue-900">
          向量库状态（Vector Index）· 已建库
        </p>
        <div className="text-xs text-blue-900 grid grid-cols-2 gap-x-4 gap-y-1">
          <p>
            子块条数（childCount）：<span className="font-mono">{status.childCount}</span>
          </p>
          <p>
            向量维度（vectorsDim）：<span className="font-mono">{status.vectorsDim}</span>
          </p>
          <p>
            提供商（provider）：<span className="font-mono">{status.provider}</span>
          </p>
          <p>
            嵌入模型（embeddingModel）：<span className="font-mono">{status.embeddingModel}</span>
          </p>
          <p>
            建库耗时（buildDurationMs）：<span className="font-mono">{status.buildDurationMs} ms</span>
          </p>
          <p>
            建库时间（builtAt，本地）：<span className="font-mono">{(status.builtAt || "").slice(11, 19)}</span>
          </p>
        </div>
        <p className="text-xs text-blue-800">
          检索时只算「问句」这一个向量，再去库里搜最像的 topK；不再每次重算所有子块。
        </p>
      </div>
    );
  };
})();