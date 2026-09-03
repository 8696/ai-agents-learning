/**
 * 职责：等 Babel 把 components/*.js 转译完、挂上 window.DemoUI 之后，再挂载本页 React。
 * 数据流：keys[] 全部出现在 window.DemoUI 上 → 调用 cb()。
 * 为什么单独成文件：<script type="text/babel" src> 是异步转译的，
 *   页面内联块如果立刻解构 window.DemoUI，拿到的是 undefined，整页白屏。
 * 加载：普通 <script src>，必须排在 components 与页面内联块之前。
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
      // 15ms 轮询：Babel 转译只需要几十毫秒，轮询比监听 load 事件更省事也更稳
      if (ready()) cb();
      else setTimeout(tick, 15);
    }
    tick();
  };
})();
