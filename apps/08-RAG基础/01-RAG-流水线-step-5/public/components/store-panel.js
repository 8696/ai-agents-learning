/**
 * 职责：左栏。建库、查看库、上传 Markdown 文件入库。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function StorePanel(props) {
    const JsonBlock = DemoUI.JsonBlock;
    const ingest = props.ingest;
    const store = props.store;
    const sources = props.sources;
    const busy = props.busy;
    const noKey = props.noKey;
    return (
      <section id="store-pane" className="bg-white shadow rounded p-4 space-y-3 min-h-[200px] border-l-4 border-emerald-700 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-900">左边 · 库里有什么（SQLite）</h2>
        {sources && sources.sourceCount > 0 ? (
          <div className="bg-amber-50 border border-amber-300 rounded p-3 space-y-1">
            <div className="text-xs font-semibold text-amber-900">
              库里当前有 {sources.sourceCount} 份来源（多份共存）
            </div>
            <ul className="text-xs text-gray-700 list-disc pl-5">
              {sources.sources.map(function (s) {
                return <li key={s.source}>{s.source} · {s.rowCount} 行</li>;
              })}
            </ul>
            <p className="text-xs text-gray-600">
              上传同名文件 → 旧版本被替换（按 source 整份先删后建）；上传不同名 → 与现有文件共存。
            </p>
          </div>
        ) : null}
        <p className="text-xs text-gray-600">
          建库：POST /api/ingest（读 refund.md）或 POST /api/ingest-upload（自己上传 MD 文件）；
          查看库：GET /api/store（只 SELECT，不调模型）。
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onIngest(); }}
            className="bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            建库（refund.md）
          </button>
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onUpload(); }}
            className="border border-emerald-600 text-emerald-700 px-4 py-2 rounded disabled:opacity-50"
          >
            上传 Markdown 文件入库
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={function () { props.onStoreSources(); }}
            className="border border-gray-300 px-3 py-2 rounded disabled:opacity-50"
          >
            查看库里有什么（按来源）
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={function () { props.onStoreRaw(); }}
            className="border border-gray-300 px-3 py-2 rounded disabled:opacity-50"
          >
            查看库里原始数据（向量库一行要存的四个字段）
          </button>
        </div>
        {props.uploading ? (
          <p className="text-xs text-amber-600">正在上传并入库……</p>
        ) : null}
        {props.storeSources && props.storeSources.sourceCount !== undefined ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-emerald-900">
              库里当前有 {props.storeSources.sourceCount} 份来源（按文件列）
            </div>
            <div className="text-xs text-gray-700">
              请求：GET /api/store-sources（按 source 分组统计行数，不调模型）
            </div>
            {props.storeSources.sourceCount === 0 ? (
              <p className="text-xs text-gray-700">库是空的。先点「建库」或「上传文件」。</p>
            ) : (
              <ul className="text-xs text-gray-800 space-y-1 list-disc pl-5">
                {(props.storeSources.sources || []).map(function (s) {
                  return (
                    <li key={s.source}>
                      <b>{s.source}</b> · {s.rowCount} 行
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {ingest ? (
          <div className="space-y-3">
            <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
              <div className="text-xs font-semibold">请求参数 · 建库 POST /api/ingest 或 POST /api/ingest-upload</div>
              {ingest.load ? (
                <>
                  <p className="text-xs">
                    无请求体（refund.md 固定）；文件：{ingest.load.source} · {ingest.load.charCount} 字 · {ingest.load.type}
                  </p>
                  <p className="text-xs text-gray-600">切块（Chunk）：{ingest.chunks.length} 张卡片</p>
                </>
              ) : ingest.source ? (
                <p className="text-xs">
                  multipart/form-data；文件名：{ingest.source} · {ingest.charCount} 字 · 类型：{ingest.type === "pdf" ? "PDF（按页分段）" : "Markdown（按 ## 分段）"}
                </p>
              ) : null}
            </div>
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
              <div className="text-xs font-semibold">调用流程 · 建库时四步</div>
              <p className="text-xs text-gray-600">实际跑了：{(ingest.stepsRan || []).join(" → ")}</p>
              {ingest.load ? (
                <>
                  <p className="text-xs text-gray-600">加载（Load）：{ingest.load.source} · {ingest.load.charCount} 字</p>
                  <p className="text-xs text-gray-600">切块（Chunk）：{ingest.chunks.length} 张卡片</p>
                  <p className="text-xs text-gray-600">向量化（Embed）：{ingest.embed.vectorCount} 条 × {ingest.embed.dimensions} 维 · {ingest.embed.model}</p>
                  <p className="text-xs text-gray-600">约定（prefixRule）：{ingest.embed.prefixRule}</p>
                </>
              ) : ingest.chunkCount !== undefined ? (
                <>
                  <p className="text-xs text-gray-600">
                    加载（Load）：{ingest.source} · {ingest.charCount} 字 · {ingest.type === "pdf" ? "PDF（pdf-parse）" : "Markdown"}
                  </p>
                  <p className="text-xs text-gray-600">
                    切块（Chunk）：{ingest.chunkCount} 张
                    {ingest.type === "pdf" && ingest.pages
                      ? "（按页分段：第 1 页 ~ 第 " + ingest.pages.length + " 页）"
                      : "（按 ## 标题分段）"}
                  </p>
                  <p className="text-xs text-gray-600">向量化（Embed）：{ingest.embed.vectorCount} 条 × {ingest.embed.dimensions} 维 · {ingest.embed.model}</p>
                  <p className="text-xs text-gray-600">约定（prefixRule）：{ingest.embed.prefixRule}</p>
                </>
              ) : null}
            </div>
            <div className="bg-green-50 border border-green-300 rounded p-3 space-y-2">
              <div className="text-xs font-semibold text-green-900">响应结果 · {ingest.source} 变成 {ingest.written} 行</div>
              <p className="text-xs text-gray-700">
                类型：{ingest.load?.type || ingest.type}
                {ingest.load?.type === "pdf" || ingest.type === "pdf" ? "（按页分段）" : "（按 ## 分段）"}
              </p>
              <p className="text-xs text-gray-700">
                原文摘录：{ingest.load?.excerpt || ingest.excerpt}
              </p>
              {ingest.type === "pdf" && ingest.pages && ingest.pages.length > 1 ? (
                <p className="text-xs text-gray-600">
                  提示：PDF 有 {ingest.pages.length} 页，共 {ingest.charCount} 字，分成 {ingest.chunkCount} 个 chunk（按页分段，每页 = 1 个 chunk；单页超 6000 字会被截断）。
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {store ? (
          <div className="space-y-3">
            <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
              <div className="text-xs font-semibold">请求参数 · 查看库 GET /api/store</div>
              <p className="text-xs">无请求体。只读 data/chunks.db，不调嵌入模型、不调聊天模型。</p>
            </div>
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
              <div className="text-xs font-semibold">调用流程 · 从 SQLite SELECT</div>
              <p className="text-xs text-gray-600">引擎 {store.engine} · 文件 {store.dbFile} · 表 {store.table}</p>
              <p className="text-xs text-gray-600">列：{(store.columns || []).join(" / ")}</p>
              <p className="text-xs text-gray-600">磁盘上向量（vector）是 JSON 文本，这里已经转成数字数组。</p>
            </div>
            <div className="bg-green-50 border border-green-300 rounded p-3 space-y-2">
              <div className="text-xs font-semibold text-green-900">
                响应结果 · 库里 {store.rowCount} 行向量库一行要存的四个字段
              </div>
              {store.rowCount === 0 ? (
                <p className="text-xs text-gray-700">还是空表。先点「建库」。</p>
              ) : (
                <ul className="text-xs text-gray-800 space-y-2 max-h-[70vh] overflow-auto">
                  {(store.rows || []).map(function (row) {
                    return (
                      <li key={row.id} className="border rounded p-2 bg-white space-y-1">
                        <div>编号（id）：{row.id}</div>
                        <div>
                          来源（source）{row.source} · 章节（section）{row.section}
                          {row.page ? <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">第 {row.page} 页</span> : null}
                          · 第 {row.chunkIndex} 张
                        </div>
                        <div>原文（text）</div>
                        <pre className="whitespace-pre-wrap max-h-24 overflow-auto">{row.text}</pre>
                        <div>向量（vector）· {Array.isArray(row.vector) ? row.vector.length : 0} 维</div>
                        <JsonBlock value={row.vector} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          ingest ? null : (
            <p className="text-sm text-gray-500">库还没打开。点「建库」或「查看库」。</p>
          )
        )}
      </section>
    );
  }

  DemoUI.StorePanel = StorePanel;
  window.DemoUI = DemoUI;
})();
