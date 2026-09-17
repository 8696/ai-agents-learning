/**
 * 职责：总览页的控件——链到四个分页面。
 * 数据流：只跳转，不发业务请求。
 * 为什么单独成文件：总览没有走一步按钮，避免和另外四页叠在同一套控件里。
 */
window.DemoUI = window.DemoUI || {};

function Controls() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">点下面任一页开始操作。各页按钮不同，不要指望在总览里把四件事一次点完。</p>
      <div className="flex flex-wrap gap-2">
        <a className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm" href="/pages/checkpoint.html">
          去「写入检查点」
        </a>
        <a className="px-3 py-1.5 rounded border border-gray-300 text-sm" href="/pages/serialize.html">
          去「不可序列化」
        </a>
        <a className="px-3 py-1.5 rounded border border-gray-300 text-sm" href="/pages/resume.html">
          去「从磁盘恢复」
        </a>
        <a className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm" href="/pages/charge-crash.html">
          去「扣款后还没写成」
        </a>
      </div>
    </div>
  );
}

window.DemoUI.Controls = Controls;
