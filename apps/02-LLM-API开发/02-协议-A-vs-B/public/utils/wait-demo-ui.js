/**
 * 职责：等 Babel 转完 components 后再挂载 React 页。
 * 数据流：keys[] 都出现在 window.DemoUI 上 → 调用 cb()。
 * 为什么：type=text/babel src 是异步转译的，内联块立刻读 DemoUI 会 undefined。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  window.DemoUtils.waitDemoUI = function waitDemoUI(keys, cb) {
    function ready() {
      if (!window.DemoUI) return false;
      for (var i = 0; i < keys.length; i++) {
        if (!window.DemoUI[keys[i]]) return false;
      }
      return true;
    }
    function tick() {
      if (ready()) cb();
      else setTimeout(tick, 15);
    }
    tick();
  };
})();
