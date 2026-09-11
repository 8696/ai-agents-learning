/**
 * 职责：共用的 JSON 块和错误条。挂 window.DemoUI。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function JsonBlock(props) {
    return (
      <pre className="whitespace-pre-wrap text-xs text-gray-700 max-h-40 overflow-auto bg-white border rounded p-2">
        {JSON.stringify(props.value, null, 2)}
      </pre>
    );
  }

  function ErrorCard(props) {
    const err = props.err;
    if (!err) return null;
    return (
      <div className="border border-red-300 bg-red-50 rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-red-800">错误</div>
        <p className="text-sm text-red-800">{err.error}</p>
        <p className="text-xs text-red-700">{err.hint}</p>
        {err.status != null ? <p className="text-xs text-gray-500">HTTP {err.status}</p> : null}
      </div>
    );
  }

  DemoUI.JsonBlock = JsonBlock;
  DemoUI.ErrorCard = ErrorCard;
  window.DemoUI = DemoUI;
})();
