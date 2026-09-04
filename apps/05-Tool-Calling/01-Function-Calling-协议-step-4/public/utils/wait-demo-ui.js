/**
 * 职责：等 components/*.js 被 Babel 转译并挂上 window.DemoUI 之后，再挂载本页 React。
 *
 * 数据流：waitDemoUI(["PageNav", …], cb) → 轮询 window.DemoUI → 齐了调 cb()。
 *
 * 为什么单独成文件：`<script type="text/babel" src=…>` 是**异步**转译的，
 * 页面内联块虽然写在后面，执行时 DemoUI 上的组件可能还没挂好，
 * 直接解构会拿到 undefined，React 渲染时报 "type is invalid"。
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
      // 15ms 轮询：Babel 转译只需要几十毫秒，用 setTimeout 比监听 DOMContentLoaded 稳
      else setTimeout(tick, 15);
    }
    tick();
  };
})();
