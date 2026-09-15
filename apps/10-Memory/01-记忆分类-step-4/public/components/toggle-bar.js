/**
 * 职责：两个对照开关 —— 不注入核心用户画像 / 跳过本轮情景召回。
 * 数据流：勾选 → 下一次 POST /api/chat 的 toggles。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.ToggleBar = function ToggleBar(props) {
    return (
      <div className="border-t pt-3 space-y-2">
        <p className="text-xs text-gray-700 font-semibold">对照开关（只影响下一次请求）</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={props.disableSemantic}
              onChange={function (e) { props.onChangeSemantic(e.target.checked); }}
              className="w-4 h-4"
            />
            <span>不注入核心用户画像</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={props.skipRecall}
              onChange={function (e) { props.onChangeSkipRecall(e.target.checked); }}
              className="w-4 h-4"
            />
            <span>跳过本轮情景召回</span>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          默认：画像每轮都在，情景按问句检索（问候 / 刚才说了什么 / 纯算术会自动跳过情景检索）。
          勾「不注入核心用户画像」再问「我用什么框架？」，对照模型还会不会说出 Vue。
        </p>
      </div>
    );
  };
})();
