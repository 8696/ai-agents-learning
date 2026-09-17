/**
 * 职责：step-6 自己的本页说明和核心教学点卡片。
 * 数据流：App 传入 page（shipping-refund / overview）。
 * 为什么单独成文件：各页教学文案不同，不堆进 layout.js。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro(props) {
  const page = props.page;
  if (page === "shipping-refund") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>变体 F 业务例子图</b>（订单发货判断 + 退款）。同一张图（fetchOrder → checkShipment → noop/refund → done）里，用户的语义是「问发货+没发就退款」一次性业务，**一份 runId 走完**。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>填订单号（以 <code className="bg-gray-100 px-1 rounded">shipped-</code> 开头的视为已发货，其它视为未发货）</li>
          <li>点「开单」→ POST <code>/api/run/shipping-refund/start</code>，生成新 runId（不调存档器，本步只演示同图同 runId 判定）</li>
          <li>反复点「走一步」→ POST <code>/api/run/shipping-refund/step</code>，看 currentNode 怎么走：fetchOrder → checkShipment → noop（已发货）/ refund（未发货） → done</li>
          <li>看 isShipped、action 字段被路由 + 节点函数正确写进 state</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点（变体 F 业务例子）</div>
          <div className="text-xs text-gray-800">
            同一张图里，用户的语义是「if/那么」一次性业务（State 共享、终态一致），走同一个 runId；上一件到 done 之后再问下一个问题，是新业务，新 runId；长流程多步表单跨用户多次输入仍是同一个 runId。本页用订单发货判断 + 退款这张图把「同图同 runId」三种边界**用一张图 + 一次会话演示清楚**。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：用 <code>shipped-12345</code> 开单 → 走到 noop（已发货）；换 <code>order-99999</code> 重开 → 走到 refund（未发货）。同一会话里「问完发货再问快递单号」= 上一件到 done 后开新 runId。
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页是 step-6 总览。这一步只演示一个新教学点:<b>业务例子图（订单发货 + 退款）</b>。其他 step-1 / step-2 / step-3 / step-4 / step-5 那几页(端口 50121 / 50122 / 50123 / 50124 / 50125)不在这里复刻。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>step-1~step-5 锁住的「最佳表达」保留;step-6 独立实现一张新图（不调存档器，本步只演示同图同 runId 判定）</li>
        <li>新加 POST <code>/api/run/shipping-refund/start</code> + <code>/api/run/shipping-refund/step</code></li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          step-6 是「加深」——补完 02 小节 §5.4 缺口表的最后一项（B1 业务例子图）。补完后 02 小节 §5.4 全 0 项未实现，可走 <code>coach complete</code> 在模块 README 02 进度行打钩。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：从下面按钮进业务例子图页，用 <code>shipped-12345</code> 和 <code>order-99999</code> 各开一件，看 isShipped 路由分流到 noop / refund。
        </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
