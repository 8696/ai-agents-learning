/**
 * 职责：渲染拼好的 Prompt（messages 数组，每段前标 role）。
 * 数据流：messages: Array<{ role, content }> → 渲染列表。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.MessagesBlock = function MessagesBlock(props) {
    const messages = props.messages || [];
    return (
      <div className="space-y-2 max-h-40 overflow-auto">
        {messages.map(function (m, i) {
          return (
            <div key={i} className="border border-gray-200 rounded p-2 bg-gray-50">
              <p className="font-semibold">[{m.role}]</p>
              <pre className="whitespace-pre-wrap text-xs text-gray-700">{m.content}</pre>
            </div>
          );
        })}
      </div>
    );
  };
})();