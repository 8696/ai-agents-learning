/**
 * 职责：把一组事实按 memoryType 分组渲染（语义记忆 / 情景记忆 两个色块）。
 * 数据流：facts: PersistedFact[] → groupByMemoryType → 渲染每个分组下的 FactCard 列表。
 *
 * 谁在用：候选池（参与召回的条目）、被排除池（toggle 关闭后被剔除的条目）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function groupByMemoryType(facts) {
    const groups = { 语义记忆: [], 情景记忆: [], 其他: [] };
    for (let i = 0; i < facts.length; i++) {
      const f = facts[i];
      if (groups[f.memoryType]) groups[f.memoryType].push(f);
      else groups["其他"].push(f);
    }
    return groups;
  }

  DemoUI.PoolBlock = function PoolBlock(props) {
    const facts = props.facts || [];
    const groups = groupByMemoryType(facts);
    return (
      <div className="space-y-2 max-h-40 overflow-auto">
        {groups["语义记忆"].length > 0 ? (
          <div className="border-l-2 border-blue-400 pl-2 space-y-1">
            <p className="text-blue-800 font-medium">语义记忆（{groups["语义记忆"].length}）</p>
            {groups["语义记忆"].map(function (f) { return <DemoUI.FactCard key={f.key} fact={f} />; })}
          </div>
        ) : null}
        {groups["情景记忆"].length > 0 ? (
          <div className="border-l-2 border-amber-400 pl-2 space-y-1">
            <p className="text-amber-800 font-medium">情景记忆（{groups["情景记忆"].length}）</p>
            {groups["情景记忆"].map(function (f) { return <DemoUI.FactCard key={f.key} fact={f} />; })}
          </div>
        ) : null}
      </div>
    );
  };
})();