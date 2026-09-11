/**
 * 职责：给页面 fetch JSON；失败时带上 HTTP 状态和 hint。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};
  window.DemoUtils.postJson = async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(function () {
      return { ok: false, error: "响应不是 JSON" };
    });
    if (!response.ok) {
      const err = new Error(data.error || "请求失败");
      err.status = response.status;
      err.hint = data.hint || "";
      err.payload = data;
      throw err;
    }
    return data;
  };
  window.DemoUtils.getJson = async function getJson(url) {
    const response = await fetch(url);
    const data = await response.json().catch(function () {
      return { ok: false, error: "响应不是 JSON" };
    });
    if (!response.ok) {
      const err = new Error(data.error || "请求失败");
      err.status = response.status;
      err.hint = data.hint || "";
      throw err;
    }
    return data;
  };

  /**
   * 把 File 对象读成 base64 字符串（去掉 data:application/pdf;base64, 前缀）。
   * 用于 PDF 上传：浏览器 → base64 → POST /api/chunk/pdf。
   */
  window.DemoUtils.readFileAsBase64 = function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = reader.result || "";
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = function () { reject(new Error("读取文件失败")); };
      reader.readAsDataURL(file);
    });
  };
})();