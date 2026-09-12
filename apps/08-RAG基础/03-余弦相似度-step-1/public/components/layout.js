/**
 * 职责：页头状态徽标、教学说明、页脚环境信息 + 三页 PageIntro（按 mode 显示）。挂 window.DemoUI。
 *       step-1 合并版：raw / topk / threshold 三 mode 共用本文件。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸ 待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄 请求中", cls: "bg-blue-100 text-blue-800" },
      done: { text: "✅ 完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌ 错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  };

  DemoUI.PageIntroRaw = function PageIntroRaw() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>用户这一问，对库里每一张卡片，谁更近</b>。
          不是短文和长文互相比。同一件事用三种算法各排一次名。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>先看功能区：1 个问题，对 4 张卡片。</li>
          <li>点「按余弦打分」：看「问题 vs 每一张」按夹角怎么排。</li>
          <li>点「按点积打分」：同一组「问题 vs 每一张」，换算法，长卡片会赢。</li>
          <li>点「按欧氏打分」：还是同一组，换算法，长卡片会输。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p id="compare-line" className="text-sm font-semibold text-gray-900">
            比的是「问题 vs 每张卡片」，不是「短文 vs 长文」。同一组里：余弦让短和长并列，点积让长赢，欧氏让长输。
          </p>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <div className="bg-white border border-yellow-200 rounded p-2">
              余弦相似度（Cosine Similarity）：只看方向 → 短和长分数一样，并列第一
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              点积（Dot Product）：不除长度 → 长的数字更大，长赢
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              欧氏距离（Euclidean Distance）：看两点有多远 → 长的站得远，长输
            </div>
          </div>
          <div className="text-xs text-gray-600">
            下面三个按钮各打一把尺子，用来核对这句。分数不是正确率。
          </div>
        </div>
      </section>
    );
  };

  DemoUI.PageIntroTopk = function PageIntroTopk() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>按本侧尺子排好序后，按 K 截前几条，剩下的进「被截掉」区</b>。
          三把尺子排序方向不同（余弦/点积越大越近，欧氏越小越近）；K 一改，最差那条立刻进/出列表。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>三侧栏共用一个 K：默认 3，可改 1~4。</li>
          <li>点「按余弦打分」：看前 K 条按夹角怎么排，被截的那条进「被截掉」区。</li>
          <li>把 K 改成 4：被截掉区变空，前 4 条全进列表。</li>
          <li>把 K 改成 1：只留第一名，长卡片在点积这一侧稳赢这一条。</li>
          <li>判定「短 vs 长」按全表算，不按截后算——避免「长被截掉就把长判输」。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p id="compare-line" className="text-sm font-semibold text-gray-900">
            Top-K 是按本侧尺子的分数截前 K 条——<b>不是</b>「vector 等于问题的」「只看第 1 条」「永远取满」。
          </p>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <div className="bg-white border border-yellow-200 rounded p-2">
              排序键是夹角分数，越大越近（余弦/点积）/ 越小越近（欧氏）
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              K 决定留几条：4 张卡 + K=3 → 第 4 条（最低分）进「被截掉」区
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              K 永远能取满——所以下一步还得加「阈值」决定喂不喂模型
            </div>
          </div>
          <div className="text-xs text-gray-600">
            下面三侧栏共用同一个 K，改 K 后再点按钮，第 4 条立刻进/出列表。
          </div>
        </div>
      </section>
    );
  };

  DemoUI.PageIntroThreshold = function PageIntroThreshold() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>Top-K 永远能取满，所以还要阈值决定「最高分够不够用」</b>。
          最高分 <b>≥</b> 阈值 → <code>decision: "answer"</code>，正常出前 K 条；
          最高分 <b>&lt;</b> 阈值 → <code>decision: "abstain"</code>，灰卡标记不可用，前 K 条不喂给模型。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>三侧栏共用 K 和阈值（默认值 3 和 0.5）。</li>
          <li>点「默认阈值 0.5」：query=[1,0]，短/长并列 1.0 → 三侧全 answer。</li>
          <li>点「调高阈值到 1.5」：同一组向量、同一个 maxScore，余弦 maxScore=1.0 {"<"} 1.5 弃权；点积 maxScore=10 {">"} 1.5 仍 answer；欧氏 maxScore=0 {"<"} 1.5 仍 answer——同一组向量，阈值变了，三侧决策可能不同。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p id="compare-line" className="text-sm font-semibold text-gray-900">
            Top-K 永远能取满——库里 3 条就一定能给你 3 条，哪怕全是 0.12。
            <b>所以还要阈值</b>：最高分够不够用，决定要不要把这些卡片当答案喂给模型。
          </p>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <div className="bg-white border border-yellow-200 rounded p-2">
              阈值是「相似度门」：余弦/点积 → maxScore {"<"} 阈值弃权；欧氏 → maxScore {">"} 阈值弃权
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              阈值是你们定的产品线，不是业内通用 0.5；换嵌入模型要重标定
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              同一组向量，调高阈值 → 余弦可能弃权，点积/欧氏仍 answer（决策因尺子方向而异）
            </div>
          </div>
          <div className="text-xs text-gray-600">
            阈值越高（余弦/点积）越严格——会拒掉原本能答的；阈值越低（欧氏）越严格——同上。没有「通用阈值」。
          </div>
        </div>
      </section>
    );
  };

  DemoUI.PageIntroCrossModel = function PageIntroCrossModel() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>分数尺度是嵌入模型决定的，不是几何真理</b>。换一家嵌入模型，分数可能被乘以某个常数；
          阈值是产品线，但必须跟着模型走——换模型要重标定。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「×1（默认）」：用原模型尺度，三侧正常。</li>
          <li>点「×2（模拟 B 模型）」：所有分数乘以 2，余弦并列 2.0（已经越界）、点积 20、欧氏 0/18/2.52/2.82；阈值 0.5 → 三侧全 answer，但 cosine 已经不能用几何解释。</li>
          <li>点「×0.5（模拟 C 模型）」：分数除以 2，余弦并列 0.5、点积 5、欧氏 0/4.5/1.26/1.41；阈值 0.5 → cosine maxScore=0.5 ≥ 0.5 → answer；点积 5 > 0.5 → answer；欧氏 0 &lt; 0.5 → answer。</li>
          <li>点「重置」：回到 ×1。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p id="compare-line" className="text-sm font-semibold text-gray-900">
            分数不是正确率，<b>也不是跨模型可比的概率</b>。
            <code>0.82</code> 在 A 模型是「夹角比较小」，换到 B 模型可能就是「最远的那条」——坐标系换了，数字不能直接减。
          </p>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <div className="bg-white border border-yellow-200 rounded p-2">
              不同模型的分数尺度差可以粗略用常数模拟——但实际是分布形态变了
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              阈值是产品线，跟着模型走——换模型必须重标定阈值，不能直接抄
            </div>
            <div className="bg-white border border-yellow-200 rounded p-2">
              余弦理论上 ∈ [-1, 1]，被 ×N 后越界——这恰恰说明「分数尺度不属于几何」
            </div>
          </div>
          <div className="text-xs text-gray-600">
            「业内通用阈值 0.5」是不存在的说法——每家嵌入模型的 0.5 含义不同。运营要求「低于 0.8 不准答」是把夹角误读成正确率。
          </div>
          <div className="bg-orange-50 border border-orange-300 rounded p-2 mt-2 text-xs space-y-1">
            <div className="font-semibold text-orange-900">⚠ 本页只演示了「跨模型重标定」4 件事中的 2 件</div>
            <div>✓ 第 2 件「分数尺度变了」+ ✓ 第 3 件「阈值要重标定」——用 ×2 / ×0.5 mock 演示。</div>
            <div>✗ 第 1 件「向量值不一样」（包括维度可能不同：A 300 维 vs B 768 维）——本页所有向量都是 2 维，看不见。</div>
            <div>✗ 第 4 件「分数不能跨模型直接比」——本页用「粗略用常数模拟」覆盖了表面，但真实跨模型是<b>分布形态变了</b>，不是简单倍数。</div>
            <div className="text-orange-800">
              真跨模型对照 = 真调两家嵌入 SDK（突破 §5.3.0「本地计算是例外」硬规则）——本仓库尚未学到。学到嵌入 SDK 后可以加 page-6「真跨模型对照（双 SDK）」。
            </div>
          </div>
        </div>
      </section>
    );
  };

  DemoUI.PageIntroContrast = function PageIntroContrast() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>余弦距离（Cosine Distance）跟余弦相似度排序方向相反</b>，名字都有「余弦」但接错排序就把最不像的喂给模型。
          同时加<b>真近义句</b>（原文不逐字 + 方向接近 = 余弦高）和<b>冲突政策</b>（方向反向但很少到 -1）两张卡，让对照更丰富。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>默认「cosine 降序」「cosineDistance 升序」= 同一件事，短同向 / 近义排前。</li>
          <li>「点积降序」= 长同向赢；「欧氏升序」= 短同向赢。</li>
          <li>❌「cosine 升序」或「cosineDistance 降序」= 排序方向反了，第 1 名变成 conflict（cosine=-0.8，最不像那张）。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p id="compare-line" className="text-sm font-semibold text-gray-900">
            cosine 越大越近 → <b>降序</b>取 Top-K；cosineDistance 越小越近 → <b>升序</b>取 Top-K。名字都有「余弦」，接错排序方向就拿到最不像的 K 条。
          </p>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <div className="bg-white border border-yellow-200 rounded p-2">「近义不同字」余弦 0.95</div>
            <div className="bg-white border border-yellow-200 rounded p-2">「冲突政策」余弦 -0.8（不到 -1）</div>
            <div className="bg-white border border-yellow-200 rounded p-2">cosine 升序（错）→ 拿到 -0.8 那张</div>
          </div>
          <div className="text-xs text-gray-600">
            有的向量库返回 cosineDistance（1 - cosine），有的再折到 [0, 2]。接库时**必须看返回的是相似度还是距离**——决定降序还是升序取 Top-K。
          </div>
          <div className="bg-orange-50 border border-orange-300 rounded p-2 mt-2 text-xs space-y-1">
            <div className="font-semibold text-orange-900">⚠ 「错排序」按钮演示的不是 demo 代码错</div>
            <div>演示的是<b>业务上高频 bug</b>：「代码错把 cosine distance 当 cosine similarity 排序」。</div>
            <pre className="bg-white rounded p-2 font-mono text-xs overflow-auto mt-1 whitespace-pre-wrap">
{`// 业务代码常见错误（不是本 demo 的代码）
const results = await vectorDB.search(query, { topK: 3 });
// ↓ 文档没说清返回的是 cosine 还是 cosine distance
results.sort((a, b) => b.score - a.score);  // ← 错：以为是 cosine similarity
// 结果：拿到 cosine distance 排出来的最不像 3 条`}
            </pre>
            <div>本 demo 的后端 scoreVectors <b>永远按正确方向排序</b>；❌ 按钮是<b>前端展示层</b>故意把已排好的结果按错的展示方向再排一遍——目的是让你亲手看到这种 bug 的输出长什么样（第 1 名变成 conflict / 破损一律不退）。</div>
            <div className="text-orange-800">下次接向量库看到「第 1 名是最不像那张」→ 立刻检查返回字段是 cosine 还是 cosine distance，排序方向有没有写反。</div>
          </div>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env;
    const port = env && env.port ? env.port : 50079;
    const provider = env && env.provider ? env.provider : "（待连接）";
    const model = env && env.model ? env.model : "（待连接）";
    const keyText = !env
      ? "密钥 （待连接）"
      : env.hasKey
        ? "密钥 ✅"
        : "密钥 ❌（apps/.env 未配置该家密钥）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 本地计算 · 不调 LLM · 模型服务商 {provider} · 模型 {model} · {keyText}
        </span>
      </footer>
    );
  };
})();