/**
 * 职责：右边处理台。扭转条 + 走一步 + 转换 / 当前 / 历史。
 * 数据流：current state 发给 POST /api/step；完成站禁用走一步。
 * 为什么单独成文件：处理台是本页教学主界面，和左边聊天拆开。
 */
window.DemoUI = window.DemoUI || {};

function DeskPane(props) {
  const Pipeline = window.DemoUI.Pipeline;
  const TransformCard = window.DemoUI.TransformCard;
  const CurrentState = window.DemoUI.CurrentState;
  const HistoryList = window.DemoUI.HistoryList;
  const state = props.state;
  const done = state && state.currentNode === "okEnd";
  const canStep = Boolean(state) && !done && !props.loading;
  const wroteKeys = props.transition ? Object.keys(props.transition.wrote || {}) : [];
  return (
    <div className="space-y-4 min-h-[420px]">
      <div>
        <div className="text-sm font-semibold text-gray-900">处理台</div>
        <p className="text-xs text-gray-500 mt-1">
          点「走一步」会发出 POST /api/faq/step，入参是当前整份状态（State）。期望：只变一站，下面四块一起更新。
        </p>
      </div>
      <Pipeline graph={props.graph} currentNode={state ? state.currentNode : null} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={!canStep}
          onClick={props.onStep}
        >
          走一步（只转移一次）
        </button>
        <button
          type="button"
          className="border border-red-300 text-red-700 text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={props.loading}
          onClick={props.onForceError}
        >
          演示后端 5xx（第二类错误 · /api/force-error）
        </button>
      </div>
      {props.errorText ? (
        <div className="border border-red-300 bg-red-50 text-red-800 text-xs rounded p-2">{props.errorText}</div>
      ) : null}
      <TransformCard
        lastCall={props.lastCall}
        transition={props.transition}
        created={props.created}
      />
      <CurrentState state={state} wroteKeys={wroteKeys} />
      <HistoryList items={props.history} />
    </div>
  );
}

window.DemoUI.DeskPane = DeskPane;
