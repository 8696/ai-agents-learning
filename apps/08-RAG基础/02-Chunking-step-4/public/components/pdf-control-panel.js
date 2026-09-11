/**
 * 职责：step-4 · F 件 · PDF 上传控件面板——选文件 + 跑按页切按钮 + 文件名展示 + 错误显示。
 *
 * 拆出来避免 index.html 超 400 行。
 * 挂 window.DemoUI.PdfControlPanel。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function PdfControlPanel(props) {
    const { running, pdfFile, onPickPdf, onFileChange, onRunPdf, error } = props;
    return (
      <div className="border-l-4 border-orange-400 bg-orange-50 px-3 py-2 space-y-3 rounded">
        <div className="text-sm font-semibold text-gray-900">第 4 段 · PDF 按页切（每页 = 1 块 · 跨页段落一定腰斩）</div>
        <input
          id="pdf-input"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={running}
            onClick={onPickPdf}
            className="border border-gray-300 bg-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {pdfFile ? "换 PDF 文件" : "选 PDF 文件"}
          </button>
          <button
            type="button"
            disabled={running || !pdfFile}
            onClick={onRunPdf}
            className="bg-orange-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            跑按页切
          </button>
          {pdfFile ? (
            <span className="text-xs text-gray-600">
              {pdfFile.name} · {(pdfFile.size / 1024).toFixed(1)} KB
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-600">
          → 选 PDF → POST /api/chunk/pdf（pdf-parse 按 \f 分页）→ 每页 = 1 个 Chunk，附带 page 字段。
          跨页段落会被腰斩——这是按页切的固有代价。
        </p>
        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-700 text-xs rounded p-2 space-y-1">
            <div>错误：{error.error}</div>
            {error.hint ? <div>提示：{error.hint}</div> : null}
            {error.status ? <div>状态：HTTP {error.status}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  DemoUI.PdfControlPanel = PdfControlPanel;
  window.DemoUI = DemoUI;
})();