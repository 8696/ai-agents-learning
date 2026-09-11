/**
 * 职责：step-3 · 4 个 chunking API 的请求函数封装（runFixed / runStructure / runFaq / runCompareQuality）。
 * 抽出来避免 index.html 超 400 行（§5.3.8 行数硬约束）。
 * 挂 window.DemoUtils.ChunkingAPI。
 */
(function () {
  async function postJson(url, body) {
    return window.DemoUtils.postJson(url, body);
  }

  function runFixed(args) {
    return postJson("/api/chunk/fixed", { text: args.text, size: args.size, overlap: args.overlap });
  }

  function runStructure(args) {
    return postJson("/api/chunk/structure", { text: args.text });
  }

  function runFaq(args) {
    return postJson("/api/chunk/faq", { text: args.text });
  }

  function runCompareQuality(args) {
    return postJson("/api/chunk/compare-quality", {
      text: args.text,
      sizeA: args.sizeA,
      overlapA: args.overlapA,
      sizeB: args.sizeB,
      overlapB: args.overlapB,
      topK: args.topK,
    });
  }

  function runDemoError() {
    return postJson("/api/demo-error", {});
  }

  function runPdfChunk(args) {
    return postJson("/api/chunk/pdf", { pdfBase64: args.pdfBase64 });
  }

  window.DemoUtils = window.DemoUtils || {};
  window.DemoUtils.ChunkingAPI = {
    runFixed: runFixed,
    runStructure: runStructure,
    runFaq: runFaq,
    runCompareQuality: runCompareQuality,
    runDemoError: runDemoError,
    runPdfChunk: runPdfChunk,
  };
})();