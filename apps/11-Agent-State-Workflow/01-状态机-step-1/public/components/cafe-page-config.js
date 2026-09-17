/**
 * 职责：咖啡店各教学页的默认饮品、提示、接口路径。
 * 数据流：CafePlayground 按 props.page 取一份配置；并行页走 /api/parallel/*。
 * 为什么单独成文件：页配置和请求逻辑分开，避免 cafe-app.js 超过行数上限。
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.CafePages = {
  objects: {
    defaultDraft: "热拿铁",
    chips: ["热拿铁"],
    chatHint: "点「下单」会发出 POST /api/cafe/start。本页先认七个对象：下单后点对象名，再走一步看字段怎么变。",
    compareEmpty: "本页重点是对象卡。走完一杯后路径会留在这里，方便你回头对字段。",
    nextDraft: function () { return "热拿铁"; },
  },
  routing: {
    defaultDraft: "热拿铁",
    chips: ["热拿铁", "冰美式", "抹茶"],
    chatHint: "点「下单」会发出 POST /api/cafe/start。请对照三杯：热拿铁、冰美式、抹茶。每一杯都是自己的请求。",
    compareEmpty: "还没有对照。分别走完热拿铁、冰美式、抹茶，三条路径会留在这里。",
    nextDraft: function (paths) {
      const names = (paths || []).map(function (row) { return row.drinkName; });
      if (names.indexOf("热拿铁") === -1) return "热拿铁";
      if (names.indexOf("冰美式") === -1) return "冰美式";
      return names.indexOf("抹茶") === -1 ? "抹茶" : "热拿铁";
    },
  },
  loop: {
    defaultDraft: "做坏的热拿铁",
    chips: ["做坏的热拿铁", "热拿铁"],
    chatHint: "点「下单」会发出 POST /api/cafe/start。先「做坏的热拿铁」看到回到制作站，再点一杯下普通「热拿铁」一次出餐。",
    compareEmpty: "还没有对照。先下一杯「做坏的热拿铁」走到无法制作，再点一杯下普通「热拿铁」走到完成。",
    nextDraft: function (paths) {
      const hasLoop = (paths || []).some(function (row) { return (row.path || "").indexOf("brewHot → brewHot") !== -1; });
      const hasOk = (paths || []).some(function (row) { return (row.path || "").indexOf("okEnd") !== -1; });
      if (!hasLoop) return "做坏的热拿铁";
      if (!hasOk) return "热拿铁";
      return "做坏的热拿铁";
    },
  },
  illegal: {
    defaultDraft: "热拿铁",
    chips: ["热拿铁"],
    allowIllegal: true,
    chatHint: "点「下单」会发出 POST /api/cafe/start。先用「走一步」看合法下一站是热饮制作；再点一杯，点「故意走到出餐」。两杯各自请求。",
    compareEmpty: "先合法走出点单；再点一杯故意跳到出餐，路径应是 takeOrder → failEnd。",
    nextDraft: function () { return "热拿铁"; },
  },
  nodeFail: {
    defaultDraft: "热饮机坏了",
    chips: ["热饮机坏了", "做坏的热拿铁"],
    chatHint: "先「热饮机坏了」：制作站写 lastError，立刻走失败边，retryCount 仍是 0。再点一杯「做坏的热拿铁」看回到本站。",
    compareEmpty: "对照：机器故障是 takeOrder → brewHot → failEnd 且 retryCount=0；做坏是 brewHot 重复、retryCount 到 3。",
    nextDraft: function (paths) {
      const names = (paths || []).map(function (row) { return row.drinkName; });
      if (names.indexOf("热饮机坏了") === -1) return "热饮机坏了";
      if (names.indexOf("做坏的热拿铁") === -1) return "做坏的热拿铁";
      return "热饮机坏了";
    },
  },
  parallel: {
    defaultDraft: "热拿铁",
    chips: ["热拿铁", "合错的拿铁"],
    apiStart: "/api/parallel/start",
    apiStep: "/api/parallel/step",
    chatHint: "点「下单」会发出 POST /api/parallel/start。先普通热拿铁看两臂都写回；再点一杯「合错的拿铁」看字段被盖掉。",
    compareEmpty: "对照：合得对的路径 takeOrder → fork → assemble → okEnd，shotReady 和 milkReady 都在；合错的在 fork 走进 failEnd。",
    nextDraft: function (paths) {
      const names = (paths || []).map(function (row) { return row.drinkName; });
      if (names.indexOf("热拿铁") === -1) return "热拿铁";
      if (names.indexOf("合错的拿铁") === -1) return "合错的拿铁";
      return "热拿铁";
    },
  },
};
