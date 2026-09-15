/**
 * 职责：记忆类别 toggle（关掉情景记忆 / 关掉语义记忆）。
 * 数据流：disableEpisodic + disableSemantic + onChangeEpisodic + onChangeSemantic → 渲染两个 checkbox。
 *
 * 业务含义：关掉的那一类整组不进候选池，进 excludedPool 单独展示对照（让学习者看到「开关关掉时哪些本来会被召回」）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.ToggleBar = function ToggleBar(props) {
    return (
      <div className="border-t pt-3 space-y-2">
        <p className="text-xs text-gray-700 font-semibold">
          记忆类别 toggle（关掉的类别整组不进候选池，进 excludedPool 单独展示对照）
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={props.disableEpisodic}
              onChange={function (e) { props.onChangeEpisodic(e.target.checked); }}
              className="w-4 h-4"
            />
            <span>关掉情景记忆（disableEpisodic）</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={props.disableSemantic}
              onChange={function (e) { props.onChangeSemantic(e.target.checked); }}
              className="w-4 h-4"
            />
            <span>关掉语义记忆（disableSemantic）</span>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          期望：① 问前端框架 + 全开 → 召回「我们组用 Vue 3」；② 问 refund + 关掉情景 → 情景条目不进余弦、Top-K 为空或只剩语义；③ 问前端框架 + 关掉语义 → 语义条目不进余弦、Top-K 为空或只剩情景。
        </p>
      </div>
    );
  };
})();