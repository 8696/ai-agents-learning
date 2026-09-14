/**
 * 职责：页面请求封装。无 JSX。
 * 数据流：fetch → JSON；4xx / 5xx 带上 error / hint。
 */
(function () {
  const DemoUtils = (window.DemoUtils = window.DemoUtils || {});

  DemoUtils.fetchJson = async function fetchJson(url, options) {
    const response = await fetch(url, options);
    let body = null;
    try {
      body = await response.json();
    } catch (_err) {
      body = null;
    }
    if (!response.ok) {
      const error = new Error((body && body.error) || "请求失败");
      error.status = response.status;
      error.hint = (body && body.hint) || "";
      error.body = body;
      throw error;
    }
    return body;
  };
})();
