/**
 * 职责：先展示知识库的父块 / 子块树，让人看见两套粒度。
 * 数据流：GET /api/corpus 的 parents + children → 按 parentId 分组渲染。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.CorpusPanel = function CorpusPanel(props) {
    const parents = props.parents || [];
    const children = props.children || [];
    if (parents.length === 0) {
      return (
        <p className="text-sm text-gray-500">知识库还没加载。刷新页面会请求 GET /api/corpus。</p>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          入库进检索表的是子块；父块另存，命中后再取。注意子块「运输途中碎裂」没有写物流保单号，父块里有。
        </p>
        {parents.map(function (parent) {
          const kids = children.filter(function (child) {
            return child.parentId === parent.id;
          });
          return (
            <div key={parent.id} className="border border-gray-200 rounded p-3 space-y-2">
              <p className="text-sm font-semibold">
                父块（Parent）· {parent.title} · id={parent.id}
              </p>
              <pre className="text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-24 overflow-auto">
                {parent.text}
              </pre>
              <ul className="space-y-1">
                {kids.map(function (child) {
                  return (
                    <li key={child.id} className="text-xs border-l-2 border-blue-300 pl-2">
                      <span className="font-medium">子块（Child）· {child.title}</span>
                      <span className="text-gray-500"> · id={child.id}</span>
                      <div className="text-gray-700">{child.text}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };
})();
