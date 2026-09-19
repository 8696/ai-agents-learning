/**
 * 职责：说明区 + 核心教学点卡片。几个月后只看页面也能讲清划界。
 */
(function () {
  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：同一句「我牛奶过敏，来一杯拿铁」，分别走「只有模型上下文协议（MCP） / 只有技能（Skills） / 两边都有」，看会不会先读过敏原、会不会真的调用 <code>make_latte</code>。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点三个按钮之一：浏览器对那一侧单独发 POST，不打包跑三条。</li>
          <li>服务端 <code>lib/flow/run-assembly.ts</code> 按装配演戏（固定剧本，不调大模型）。</li>
          <li>输出区留下这一侧的请求参数、调用流程、最终回复；三个都点过就能并排对照。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            模型上下文协议（MCP）管能访问什么；技能（Skills）和仓库规则文件（AGENTS.md）管按店规怎么做。只有吧台会给过敏客人做出奶咖；只有手册会空口说做好了；两边都有才会先读 <code>cafe://allergy-info</code> 再改推美式。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：看三张结果里「调用了 make_latte（calledMakeLatte）」「读了过敏原（readAllergy）」「假装做好了（fabricatedDone）」三个判定，必须不一样。
          </div>
        </div>
      </section>
    );
  }

  window.DemoUI = Object.assign(window.DemoUI || {}, { PageIntro: PageIntro });
})();
