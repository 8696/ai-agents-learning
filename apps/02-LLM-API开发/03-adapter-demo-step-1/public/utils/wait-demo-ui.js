/**
 * 职责：等 components 挂上 DemoUI 再挂载页面。
 * 数据流：waitDemoUI(keys, cb) 轮询 window.DemoUI。
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
