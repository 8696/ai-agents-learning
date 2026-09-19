/**
 * 职责：一侧装配的结果卡片。灰=请求参数，白=过程轨迹，绿=最终回复。
 * 徽标按 calledMakeLatte / readAllergy / fabricatedDone 判断。
 */
(function () {
  function Badge(props) {
    const on = props.on;
    return (
      <span className={"text-xs px-2 py-0.5 rounded " + (on ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}>
        {props.label}：{on ? "是" : "否"}
      </span>
    );
  }

  function AssemblyResultCard(props) {
    const pack = props.pack;
    if (!pack) {
      return (
        <div className="border border-dashed border-gray-300 rounded p-3 text-xs text-gray-500">
          {props.emptyText}
        </div>
      );
    }
    if (pack.error) {
      return (
        <div className="border border-red-300 bg-red-50 rounded p-3 text-sm text-red-800">
          {pack.title}失败（HTTP {pack.status}）：{pack.error}
        </div>
      );
    }
    const r = pack.result;
    const obs = r.observed;
    return (
      <article className="border border-gray-200 rounded p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{pack.title}</h3>
          <span className="text-xs text-gray-500">{pack.elapsedMs} ms · {pack.url}</span>
        </div>
        <div className="bg-gray-50 text-gray-700 rounded p-2 text-xs space-y-1">
          <div>请求参数：客人说「{r.guestUtterance}」</div>
          <div>这一侧装了：工具 {r.loaded.mcpTools.length ? r.loaded.mcpTools.join("、") : "（无）"}；技能 {r.loaded.skillText ? "有出杯技能" : "无"}</div>
        </div>
        <ol className="text-xs text-gray-700 list-decimal pl-5 space-y-1 bg-white border border-gray-200 rounded p-2">
          {r.trace.map(function (step, i) {
            return <li key={i}><b>{step.title}</b> — {step.detail}</li>;
          })}
        </ol>
        <div className="flex flex-wrap gap-1">
          <Badge on={obs.calledMakeLatte} label="调用了 make_latte（calledMakeLatte）" />
          <Badge on={obs.readAllergy} label="读了过敏原（readAllergy）" />
          <Badge on={obs.fabricatedDone} label="假装做好了（fabricatedDone）" />
          <Badge on={obs.followedSkill} label="按技能先读再决定（followedSkill）" />
        </div>
        <div className="bg-green-50 border border-green-300 rounded p-2 text-sm text-green-900">
          最终回复：{r.finalReply}
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-600 max-h-32 overflow-auto bg-gray-50 rounded p-2">{JSON.stringify(r, null, 2)}</pre>
      </article>
    );
  }

  window.DemoUI = Object.assign(window.DemoUI || {}, { AssemblyResultCard: AssemblyResultCard });
})();
