/**
 * 职责：step-3/4 页面所有动作函数（runFixed / runStructure / runFaq / runCompareQuality / runPdfChunk / runDemoError / runEmpty）的封装。
 *
 * 每个动作接收 args + setter 钩子（setBusy / setStatus / setXxxErr / setXxxResult），做：
 *   setBusy(true) → setStatus("loading") → 调 API → setXxxResult / setXxxErr → setStatus("ok"/"err") → setBusy(false)
 *
 * 抽出来避免 index.html 超 400 行。挂 window.DemoUtils.RunActions。
 */
(function () {
  function setErrorFrom(setX) {
    return function (error) {
      setX({ error: error.message || "失败", hint: error.hint || "", status: error.status });
    };
  }

  async function runWith(setters, fn) {
    setters.setBusy(true);
    setters.setStatus("loading");
    if (setters.clearErr) setters.clearErr();
    try {
      await fn();
      setters.setStatus("ok");
    } catch (error) {
      setters.setStatus("err");
      if (setters.setErr) setters.setErr({ error: error.message || "失败", hint: error.hint || "", status: error.status });
    } finally {
      setters.setBusy(false);
    }
  }

  function makeRunFixed(setX) {
    return function (args) {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setFixedErr(null),
        setErr: setX.setFixedErr,
      }, async function () {
        const data = await window.DemoUtils.ChunkingAPI.runFixed({ text: args.text, size: args.size, overlap: args.overlap });
        setX.setFixed(data.result);
      });
    };
  }

  function makeRunStructure(setX) {
    return function (args) {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setStructureErr(null),
        setErr: setX.setStructureErr,
      }, async function () {
        const data = await window.DemoUtils.ChunkingAPI.runStructure({ text: args.text });
        setX.setStructure(data.result);
      });
    };
  }

  function makeRunFaq(setX) {
    return function (args) {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setFaqErr(null),
        setErr: setX.setFaqErr,
      }, async function () {
        const data = await window.DemoUtils.ChunkingAPI.runFaq({ text: args.text });
        setX.setFaq(data.result);
      });
    };
  }

  function makeRunCompareQuality(setX) {
    return function (args) {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setCompareErr(null),
        setErr: setX.setCompareErr,
      }, async function () {
        const data = await window.DemoUtils.ChunkingAPI.runCompareQuality({
          text: args.text,
          sizeA: args.sizeA,
          overlapA: args.overlapA,
          sizeB: args.sizeB,
          overlapB: args.overlapB,
          topK: args.topK,
        });
        setX.setCompareResult(data.result);
      });
    };
  }

  function makeRunPdfChunk(setX) {
    return function (args) {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setPdfErr(null),
        setErr: setX.setPdfErr,
      }, async function () {
        const data = await window.DemoUtils.ChunkingAPI.runPdfChunk({ pdfBase64: args.pdfBase64 });
        setX.setPdfResult(data.result);
      });
    };
  }

  function makeRunDemoError(setX) {
    return function () {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setErr(null),
        setErr: setX.setErr,
      }, function () {
        return window.DemoUtils.ChunkingAPI.runDemoError();
      });
    };
  }

  function makeRunEmpty(setX) {
    return function (args) {
      return runWith({
        setBusy: setX.setBusy,
        setStatus: setX.setStatus,
        clearErr: () => setX.setErr(null),
        setErr: setX.setErr,
      }, function () {
        return window.DemoUtils.ChunkingAPI.runFixed({ text: "", size: args.size, overlap: args.overlap });
      });
    };
  }

  function makeActions(setX) {
    return {
      runFixed: makeRunFixed(setX),
      runStructure: makeRunStructure(setX),
      runFaq: makeRunFaq(setX),
      runCompareQuality: makeRunCompareQuality(setX),
      runPdfChunk: makeRunPdfChunk(setX),
      runDemoError: makeRunDemoError(setX),
      runEmpty: makeRunEmpty(setX),
    };
}

  window.DemoUtils = window.DemoUtils || {};
  window.DemoUtils.RunActions = { makeActions: makeActions };
})();