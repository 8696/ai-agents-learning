/**
 * 职责：等 Babel 把 components/*.js 转译完、挂上 window.DemoUI 之后，再挂载本页 React。
 * 数据流：keys[] 全部出现在 window.DemoUI 上 → 调用 cb()。
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
