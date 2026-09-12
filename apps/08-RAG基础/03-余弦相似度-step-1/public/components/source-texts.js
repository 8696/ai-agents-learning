/**
 * 职责：画清「1 个问题对 4 张卡片」。比的是问题对每张的远近，不是短文对长文。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.SourceTexts = function SourceTexts() {
    return (
      <div id="source-texts" className="space-y-3">
        <div className="text-sm text-gray-900 font-semibold">比的是什么</div>
        <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap text-gray-800">
{`用户问题
  「昨天买的杯子裂了，怎么退？」
        │
        │  问四次：这张卡片离问题近不近？
        │
        ├─ 卡片 A  运输破损可补发或退货。
        ├─ 卡片 B  同一句 + 后面一长段免责（意思没变，只是写长了）
        ├─ 卡片 C  包装完好的商品支持 7 天无理由退货。
        └─ 卡片 D  发票默认开个人抬头，对公请提供税号。`}
        </pre>
        <p className="text-xs text-gray-600">
          检索每次都是「问题对一张卡片」打一个分数，再按分数排队。
          本页把排队做三遍，换三种算法。短文和长文不会拿来互相比对。
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm space-y-1">
          <div className="text-xs text-blue-800">用户问题（query）· 比较的左边，只有这一句</div>
          <div>昨天买的杯子裂了，怎么退？</div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="border border-gray-200 rounded p-3 space-y-1">
            <div className="text-xs text-gray-500">卡片 A · 短政策</div>
            <div className="text-sm">运输破损可补发或退货。</div>
          </div>
          <div className="border border-gray-200 rounded p-3 space-y-1">
            <div className="text-xs text-gray-500">卡片 B · 长政策 · 和 A 同一句，只是写长了</div>
            <div className="text-sm">
              运输破损可补发或退货。以下情形由买家自行承担且不影响本条结论：签收后自行摔坏、未在
              48 小时内拍照举证、包装丢弃无法核对物流责任、偏远地区二次运输损耗、赠品缺失、发票抬头与下单人不一致时的改开周期、七个工作日内核销延迟、以及客服值班话术中出现的其他免责说明。本段只是把同一句政策写长，意思没有变。
            </div>
          </div>
          <div className="border border-gray-200 rounded p-3 space-y-1">
            <div className="text-xs text-gray-500">卡片 C · 略偏</div>
            <div className="text-sm">包装完好的商品支持 7 天无理由退货。</div>
          </div>
          <div className="border border-gray-200 rounded p-3 space-y-1">
            <div className="text-xs text-gray-500">卡片 D · 无关</div>
            <div className="text-sm">发票默认开个人抬头，对公请提供税号。</div>
          </div>
        </div>
      </div>
    );
  };
})();
