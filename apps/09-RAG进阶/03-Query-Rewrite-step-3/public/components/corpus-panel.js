/**
 * 职责：展示服务端返回的切块列表。高亮 isTarget。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function CorpusPanel(props) {
    const chunks = props.chunks || [];
    if (chunks.length === 0) {
      return <div className="text-sm text-gray-500">还没有拉到服务端切块。</div>;
    }
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-800">库里的切块（Chunk）· 来自服务端</div>
        {chunks.map(function (chunk) {
          const border = chunk.isTarget ? "border-yellow-400 bg-yellow-50" : "border-gray-200 bg-white";
          return (
            <article key={chunk.id} className={"border rounded p-3 " + border}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{chunk.title}</div>
                <div className="text-xs text-gray-500">
                  id={chunk.id}
                  {chunk.isTarget ? " · 目标切块" : ""}
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-xs text-gray-700 mt-1 max-h-24 overflow-auto">{chunk.text}</pre>
            </article>
          );
        })}
      </div>
    );
  }

  DemoUI.CorpusPanel = CorpusPanel;
})();