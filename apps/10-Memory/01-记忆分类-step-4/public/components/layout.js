/**
 * 职责：页头状态、教学说明、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "完成", cls: "bg-green-100 text-green-800" },
      error: { text: "错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  };

  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>行业里一次请求怎么组装消息列表（messages）</b>。
          程序性记忆（Procedural Memory）和核心用户画像（语义记忆 Semantic Memory）写入这一次的系统设定区（system，即数组第 1 条）；
          情景记忆（Episodic Memory）也写入同一次 system 里单独一章，按当前问句替换；
          工作记忆（Working Memory）不进 system，接到后面的对话轮次。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>先随便问一句「写个按钮」，再问「我用什么框架？」——画像里的 Vue 两轮都在 system 里，不会被第二问的情景召回换掉。</li>
          <li>再问「我处理过哪些批量改价任务？」——③ 会换成跟改价有关的经历；② 的 Vue / 深圳仍在。</li>
          <li>勾上「不注入核心用户画像」再问框架，对照模型还能不能说出 Vue。</li>
          <li>「结束会话」只清空工作记忆；「清空用户记忆」只清空事实库，全员规则不动。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">不是所有长期记忆都按问句检索。</span>
              条数少、几乎每问都要用的用户事实（ChatGPT 的已保存记忆、Letta 的核心记忆）整份常驻 system；
              会无限增长的经历才按问句召回，并且召回块不写进对话历史。
            </li>
            <li>
              <span className="font-medium">system 就是 messages[0]。</span>
              程序性、画像、本轮经历都放系统设定区；user / assistant 只留真正说过的话。
            </li>
            <li>
              <span className="font-medium">怎么观察。</span>
              连问两句不同的题：② 核心画像条数和原文应保持不变；③ 本轮经历可以变或跳过。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50103;
    const hasKey = Boolean(env.hasKey);
    const providerLabel = env.provider ? String(env.provider) : "（待连接）";
    const modelLabel = env.model ? String(env.model) : "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {modelLabel} · 密钥{" "}
          {hasKey ? "已配置" : "未配置（apps/.env 里当前这家还没有密钥）"}
        </span>
      </footer>
    );
  };
})();
