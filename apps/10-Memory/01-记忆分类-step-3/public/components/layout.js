/**
 * 职责：页头状态、教学说明、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌错误", cls: "bg-red-100 text-red-800" },
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
          本页只演示：<b>用嵌入向量（embedding）按余弦相似度召回 + 拼进 Prompt + 调大模型</b>。
          拿一句用户的问句，去事实库用嵌入模型把问句和每条事实都变成稠密向量，
          按余弦相似度排序、取 Top-K=3，把这三条拼进 system 段，再调模型拿回答。
          事实库来自第二步（<code className="bg-gray-100 px-1 rounded">data/facts.json</code>）。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>输入一句问句（或点例句）→ 点「只检索看 Prompt」（POST /api/retrieve，调嵌入接口 + 余弦 + 阈值弃权 + 拼 Prompt，不调对话模型）</li>
          <li>页面同时展示：① 事实库候选池 ② 筛出来的 Top-K + 每条的余弦相似度 ③ 拼好的完整 Prompt ④ 阈值弃权信息（Top-1 低于阈值时的提示）</li>
          <li>想看模型最终回答 → 点「检索并问」（POST /api/ask，嵌入 + 余弦 + 阈值弃权 + 拼 Prompt + 调真对话模型）</li>
          <li>页面再补两张卡：完整模型请求 + 完整模型响应 + 模型基于筛出的事实给出的回答</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">长期记忆 ≠ 全量注入 Prompt</span>：
              不管事实库有多少条，问一次只拼 Top-K=3 进去；其余留在库里等下次问。
            </li>
            <li>
              <span className="font-medium">「相关性」= 嵌入向量的余弦相似度</span>：
              问句和每条事实都过同一个嵌入模型变成稠密向量，分数 = A·B / (|A|·|B|)；
              分数最高的三条就是这次召回。语义近但字面不同的句子（"我住哪个城市" vs "我是深圳人"）也能被筛上。
            </li>
            <li>
              <span className="font-medium">阈值弃权：Top-1 分数低于阈值 → 整组 Top-K 视为空</span>：
              嵌入检索有个特点——任何问句都能找到「最相近」那条事实在 Top-K=3 内，但「最相近」不等于「相关」。
              阈值（默认 0.10）把「强相关」和「弱相关 / 噪声」分开：低于阈值 → Top-K 为空，模型收到 system
              段「没有任何一条相关」的提示，自然回答「不知道」。
            </li>
            <li>
              <span className="font-medium">阈值需要按模型标定</span>：
              不同模型 / 维度的「强 / 弱」分界不一样——minimax 1536 维用 0.10；切到 zhipu / qwen / custom
              阈值需要重新调（详见模块 08 RAG 基础「跨模型重标定」）。
            </li>
            <li>
              <span className="font-medium">拼好的 Prompt 才是送给模型的字</span>：
              system 段先告诉模型「只能基于筛出的事实回答」+ 把三条事实摆好；user 段只放问句。
              Top-K 为空时 system 段会写明「没有任何一条相关」，模型自然答「不知道」。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50102;
    const hasKey = Boolean(env.hasKey);
    const providerLabel = env.provider ? String(env.provider) : "（待连接）";
    const modelLabel = env.model ? String(env.model) : "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {modelLabel} · 密钥{" "}
          {hasKey ? "✅" : "❌（apps/.env 未配置该家密钥）"}
        </span>
      </footer>
    );
  };
})();