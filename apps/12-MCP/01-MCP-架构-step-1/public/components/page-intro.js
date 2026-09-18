/**
 * 职责：页顶说明。总览讲初始化与工具发现；调用工具页讲 tools/call；资源页讲 resources/list + read；模板页讲 prompts/list + get。
 * 数据流：props.mode → 四套文案。无请求。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function OverviewIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>初始化（initialize）再做工具发现（tools/list）。</b>
          类似于点咖啡：先问吧台开门了没，再问你能提供做什么咖啡。单上有一杯「拿铁」。这页还不真去做一杯。真做一杯请点顶部「调用工具」。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「① 初始化」：发出 initialize。看响应里有没有 capabilities.tools。类似于问吧台开门了没。</li>
          <li>再点「② 工具发现」：发出 tools/list。看 result.tools 里有没有 make_latte（拿铁）。类似于问吧台：你能提供做什么咖啡。</li>
        </ol>
        <div className="grid md:grid-cols-2 gap-2 text-xs">
          <div className="border border-blue-200 bg-blue-50 rounded p-2">
            <div className="font-semibold">你作为 Agent 端 = 点咖啡小程序</div>
            <p>先做初始化，再做工具发现。工具列表是吧台给的，不是小程序自己写死在代码里的。</p>
          </div>
          <div className="border border-green-200 bg-green-50 rounded p-2">
            <div className="font-semibold">你作为工具提供方 = 吧台</div>
            <p>实现 initialize（告诉小程序：我能做咖啡），实现 tools/list（把「拿铁」写进工具列表）。</p>
          </div>
        </div>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            最小 MCP 先问两次：初始化（initialize · 问吧台开门了没），工具发现（tools/list · 你能提供做什么咖啡）。每一次问和每一次答，都带同一个编号（id）。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：① 的响应里有 capabilities.tools；② 的响应里工具名是 make_latte。看见名字还不等于已经做出来。调用工具（tools/call）在下一页。
          </div>
        </div>
      </section>
    );
  }

  function CallIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>调用工具（tools/call）。</b>
          类似于点咖啡：已经看到饮品单上有拿铁，现在才真去做一杯。资源（resources）和提示词模板（prompts）这页不加。也不调大模型。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「① 初始化」：发出 initialize。调用工具前仍要先打招呼。</li>
          <li>点「② 工具发现」：发出 tools/list。确认工具名是 make_latte。</li>
          <li>点「③ 调用工具」：发出 tools/call。看 result.content 里有没有「拿铁做好了」。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            工具发现只是看见菜单。调用工具（tools/call）才是真下单。请求里要带工具名 name 和参数 arguments（这里是杯型 cupSize）。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：③ 的请求 method 是 tools/call；响应 result.content[0].text 写着一杯拿铁做好了；result.isError 是 false。
          </div>
        </div>
      </section>
    );
  }

  function ResourcesIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>资源原语（resources/list + resources/read）。</b>
          类似于点咖啡：服务员把「今日菜单和过敏原说明」放到桌上让你下单前必须看见——这不是你点的菜，是店里决定你下单前必须看见的信息。也不调大模型。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「① 初始化」：发出 initialize。这一步的响应里 capabilities 同时有 tools 和 resources 两扇门。</li>
          <li>点「② 资源发现」：发出 resources/list。看 result.resources 里列出 cafe://today-menu（今日菜单）和 cafe://allergy-info（过敏原说明）两条。</li>
          <li>从下拉里挑一个 URI，点「③ 读取资源」：发出 resources/read {`{ uri }`}。看 result.contents[0].text 是不是这份资料的正文。</li>
        </ol>
        <div className="grid md:grid-cols-2 gap-2 text-xs">
          <div className="border border-blue-200 bg-blue-50 rounded p-2">
            <div className="font-semibold">对照：工具（tool）</div>
            <p>模型决定要不要调，调用有副作用（真做一杯拿铁）。这一页的 resources 和 tools/call 是同一个服务端、同一根专线，但角色反过来——看下面。</p>
          </div>
          <div className="border border-purple-200 bg-purple-50 rounded p-2">
            <div className="font-semibold">本页：资源（resource）</div>
            <p>应用 / 宿主（小程序）自己决定要不要塞上下文。读出来的是「正文」，没有副作用——吧台只是把这份材料递给你，不会替你点单。</p>
          </div>
        </div>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            资源 = 应用控制（不是模型决定用，是宿主决定塞）。两步：先 resources/list 拿 URI 清单，再 resources/read 按 URI 拿正文。读出来的是文本，没有副作用。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：② 的响应里 result.resources 是两条（uri = cafe://today-menu / cafe://allergy-info）；③ 的请求 method = resources/read、params.uri 是你挑的那条；响应 result.contents[0].text 是资料正文，contents[0].mimeType = text/plain。
          </div>
        </div>
      </section>
    );
  }

  function PromptsIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>提示词模板原语（prompts/list + prompts/get）。</b>
          类似于奶茶店墙上的「套餐 A / 套餐 B」——套餐由门店维护，你点套餐 B，店员按配方做。模型不决定用不用，由用户（客服）点。也不调大模型。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「① 初始化」：发出 initialize。这一步的响应里 capabilities 同时有 tools / resources / prompts 三扇门。</li>
          <li>点「② 模板发现」：发出 prompts/list。看 result.prompts 里列出 refund-script 一份（含 arguments: orderId、reason）。</li>
          <li>填入「订单号（orderId）」和「退款原因（reason）」，点「③ 取模板」：发出 prompts/get {`{ name: "refund-script", arguments }`}。看 result.messages 是不是带 Few-shot 的 user + assistant 两条消息。</li>
        </ol>
        <div className="grid md:grid-cols-3 gap-2 text-xs">
          <div className="border border-blue-200 bg-blue-50 rounded p-2">
            <div className="font-semibold">工具（tool）</div>
            <p>模型决定用，调用有副作用。模型选 → tools/call。</p>
          </div>
          <div className="border border-purple-200 bg-purple-50 rounded p-2">
            <div className="font-semibold">资源（resource）</div>
            <p>宿主决定塞，读取没有副作用。宿主读 → resources/read。</p>
          </div>
          <div className="border border-amber-200 bg-amber-50 rounded p-2">
            <div className="font-semibold">本页：模板（prompt）</div>
            <p>用户决定用，带 arguments 参数化。用户点 → 宿主 prompts/get → 塞 messages。</p>
          </div>
        </div>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            提示词模板 = 用户控制。两步：先 prompts/list 拿模板清单（含 arguments 描述），再 prompts/get 带 name + arguments 拿消息数组。返回的 messages 数组要由宿主再塞进这一轮对话，不是服务端直接给模型。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：② 的响应里 result.prompts[0].arguments 有 orderId / reason（都 required: true）；③ 的请求 method = prompts/get、params 里有 name + arguments；响应 result.messages 是 user + assistant 两条消息，content.text 是带 Few-shot 的中文话术。
          </div>
        </div>
      </section>
    );
  }

  function PageIntro(props) {
    if (props.mode === "tools-call") return <CallIntro />;
    if (props.mode === "resources") return <ResourcesIntro />;
    if (props.mode === "prompts") return <PromptsIntro />;
    return <OverviewIntro />;
  }

  DemoUI.PageIntro = PageIntro;
  window.DemoUI = DemoUI;
})();
