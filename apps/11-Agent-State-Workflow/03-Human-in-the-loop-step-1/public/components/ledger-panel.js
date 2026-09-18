/**
 * 职责：假账本卡片。余额和扣款函数调用次数是本步最重要的可观察量。
 * 数据流：App 传入 snapshot.ledger。
 * 为什么单独成文件：账本是单独一块可视单元，不堆进内联块。
 */
window.DemoUI = window.DemoUI || {};

function LedgerPanel(props) {
  const ledger = props.ledger;
  if (!ledger) {
    return (
      <div className="border border-gray-200 rounded p-3 text-xs text-gray-500">
        账本还没加载。页面打开后会自动拉取。
      </div>
    );
  }
  return (
    <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
      <div className="text-xs font-semibold text-gray-800">假账本（ledger）</div>
      <p className="text-xs text-gray-600">
        账户（account）：{ledger.account}
      </p>
      <p className="text-sm text-gray-900">
        余额（balance）：<b>{ledger.balance}</b>
      </p>
      <p className="text-sm text-gray-900">
        扣款函数调用次数（transferCallCount）：<b>{ledger.transferCallCount}</b>
      </p>
      <p className="text-sm text-gray-900">
        查余额函数调用次数（getBalanceCallCount）：<b>{ledger.getBalanceCallCount}</b>
      </p>
      <p className="text-xs text-gray-500">
        transferCallCount 为 0 表示 executeTransfer 还没进；getBalanceCallCount 每次「查余额」自动 +1。点头前 transferCallCount 必须仍是 0。
      </p>
    </div>
  );
}

window.DemoUI.LedgerPanel = LedgerPanel;
