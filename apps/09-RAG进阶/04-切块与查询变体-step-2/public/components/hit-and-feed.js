/**
 * 职责：并排展示「检索命中的子块」和「将喂给模型的父块」。
 * 数据流：接口 childHits / parentsFed → 左栏检索、右栏生成材料。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.HitAndFeed = function HitAndFeed(props) {
    const hits = props.childHits || [];
    const parents = props.parentsFed || [];
    const dropped = props.duplicateChildIdsDropped || [];
    return (
      <div className="grid md:grid-cols-2 gap-3">
        <div className="border border-gray-300 bg-white rounded p-3 space-y-2">
          <p className="text-sm font-semibold">检索命中的子块（Child hits）</p>
          <p className="text-xs text-gray-500">这一栏是检索单位：主题单一、字少、用来打分。</p>
          {hits.length === 0 ? (
            <p className="text-sm text-gray-500">没有子块分数大于 0。</p>
          ) : (
            hits.map(function (hit) {
              return (
                <div key={hit.id} className="bg-gray-50 rounded p-2 text-xs space-y-1">
                  <p>
                    第 {hit.rank} 名 · 重叠分 {hit.score} · id={hit.id} · 父亲 parentId={hit.parentId}
                  </p>
                  <p className="font-medium">{hit.title}</p>
                  <pre className="whitespace-pre-wrap">{hit.text}</pre>
                </div>
              );
            })
          )}
        </div>
        <div className="border border-green-300 bg-green-50 rounded p-3 space-y-2">
          <p className="text-sm font-semibold">将喂给模型的父块（Parents fed）</p>
          <p className="text-xs text-gray-600">
            这一栏是生成单位：同一节全文。多个子块命中同一父块时只出现一次。
          </p>
          {dropped.length > 0 ? (
            <p className="text-xs text-amber-800">
              去重：这些子块的父亲已经在名单里，不再重复喂一次：{dropped.join("、")}
            </p>
          ) : null}
          {parents.map(function (parent) {
            return (
              <div key={parent.id} className="bg-white border border-green-200 rounded p-2 text-xs space-y-1">
                <p>
                  id={parent.id} · 由子块 {parent.hitChildIds.join("、")} 命中
                </p>
                <p className="font-medium">{parent.title}</p>
                <pre className="whitespace-pre-wrap max-h-40 overflow-auto">{parent.text}</pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
})();
