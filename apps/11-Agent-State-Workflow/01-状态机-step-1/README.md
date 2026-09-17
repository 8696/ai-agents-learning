# 状态机 · 第一步（step-1）

七个教学页共用这一口：线性 FAQ 走一步、咖啡店七个对象、条件路由、循环回边、非法转移、节点失败、并行汇合。不调大模型，不用 LangGraph。

## 怎么跑

```bash
cd apps
yarn app:11-01-state-machine-step-1
```

浏览器打开 http://127.0.0.1:50117/

**端口**：`50117`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表同一数字）

## 页面

| 页 | 看什么 |
| --- | --- |
| `/` | 总览，链到下面七页 |
| `/pages/linear.html` | 内部 FAQ 直线三站。发送 → 走一步三次才出回复 |
| `/pages/objects.html` | 对着这杯咖啡点开七个核心对象（真实字段 + 伪代码） |
| `/pages/routing.html` | 热拿铁 / 冰美式 / 抹茶三条路径对照；漏网走进失败终止 |
| `/pages/loop.html` | 做坏的热拿铁回到制作站，满 3 次走进失败终止 |
| `/pages/illegal.html` | 点单后故意跳到出餐；边表没有这条路，调度器拦住 |
| `/pages/node-fail.html` | 热饮机坏了：写 lastError 立刻走失败边；对照做坏会回到本站 |
| `/pages/parallel.html` | 浓缩 ∥ 打奶；合得对两字段都在，合错把另一臂盖掉 |

## 数据流

```text
线性 FAQ
  左边发送 → POST /api/faq/start → 停在 rewrite
  右边走一步 → POST /api/faq/step → 只转移一站

咖啡店主图各页
  左边下单 → POST /api/cafe/start → 停在 takeOrder
  右边走一步 → POST /api/cafe/step → 路由读字段，再对边表验一次

并行汇合页
  左边下单 → POST /api/parallel/start → 停在 takeOrder
  右边走一步 → POST /api/parallel/step → 分流站一次跑两臂，只合并各自字段
```

## 当前能做什么

- 看见节点 / 边 / 当前站 / 整份状态（State）
- 点七个对象名，看见这份订单的字段和伪代码
- 同一张图、不同饮品名，走出不同路径
- 制作失败沿回边回到同一站，次数写在 retryCount
- 下一站不在出边名单里时被拦住，HTTP 仍是 200
- 节点执行失败写 lastError 走失败边，不把图摔死
- 图上两条臂同时出发，只合并自己改的字段；合错会盖掉另一臂

对应笔记：`docs/学习模块/11-Agent-State-Workflow/01-状态机.md`
