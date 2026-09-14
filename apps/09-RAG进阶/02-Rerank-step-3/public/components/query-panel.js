/**
 * 职责：问句和两步按钮。先召回再精排，不压成一个按钮。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.QueryPanel = function QueryPanel(props) {
    const busy = props.status === "loading";
    const hasRecall = Boolean(props.recall);
    const noKey = props.env && props.env.hasKey === false;

    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <label className="block space-y-1">
          <span className="text-sm text-gray-800">问句（query）</span>
          <textarea
            className="w-full border border-gray-300 rounded p-2 text-sm"
            rows={2}
            value={props.query}
            disabled={busy}
            onChange={function (event) {
              props.onQueryChange(event.target.value);
            }}
          />
          <span className="text-xs text-gray-500">
            改问句后要重新走第一步。精排会带上你现在看到的这句，不是另搜一遍。
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="bg-blue-600 text-white text-sm px-3 py-2 rounded disabled:opacity-50"
            disabled={busy}
            onClick={props.onRecall}
          >
            第一步：从整库捞候选（recall）
          </button>
          <button
            type="button"
            className="bg-blue-600 text-white text-sm px-3 py-2 rounded disabled:opacity-50"
            disabled={busy || !hasRecall || noKey}
            onClick={props.onRerank}
          >
            第二步：给桌上的候选打精排分（rerank）
          </button>
          <button
            type="button"
            className="border border-gray-300 text-sm px-3 py-2 rounded disabled:opacity-50"
            disabled={busy}
            onClick={props.onEmptyError}
          >
            演示空问句 4xx
          </button>
          <button
            type="button"
            className="border border-gray-300 text-sm px-3 py-2 rounded disabled:opacity-50"
            disabled={busy}
            onClick={props.onForceError}
          >
            演示后端 5xx
          </button>
        </div>

        <p className="text-xs text-gray-500">
          第一步只请求 <code>/api/recall</code>。第二步只请求 <code>/api/rerank</code>，文档数组 = 桌上那些 id。
          {noKey ? " 当前没有密钥，第二步按钮不可用。" : ""}
        </p>
      </section>
    );
  };
})();
