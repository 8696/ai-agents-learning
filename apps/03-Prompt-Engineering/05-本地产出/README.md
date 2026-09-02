# 豆谷客服中台 · 模块 03 本地产出

这是一份**客服产品**，不是把 01～04 小节 Demo 的按钮摆在同一页。

## 跑入口

```bash
cd apps
yarn app:03-05-prompt-lab
```

浏览器：`http://127.0.0.1:50305/`

可选批量回归（不算过关）：`yarn app:03-05-local-products`

## 数据流

```text
客服贴来信 → POST /api/inbox
  → 并行：路由 / 抽订单 / Few-shot 评价 / 情感 / 书面转述 / 摘要
  → 一张工单 + 页脚 Prompt 版本

会议待办 → POST /api/minutes → action items
制度问答 → POST /api/faq → 只根据内置制度答，没有就说不知道
```

用户输入一律走 `renderPrompt` 转义。不 import `01-`～`04-`。Zero/Few 对照页仍在按条 Demo `50302`。

## 当前能做什么

- 处理一封真实形态的客户来信，得到去向、字段、评价、情感、转述、摘要
- 纪要生成待办；制度问答拒答
- 空来信 400；接口失败 502；断网时 `#status-pill` 变红

## 对应学习沉淀

[docs/学习模块/03-Prompt-Engineering/05-本地产出.md](../../../docs/学习模块/03-Prompt-Engineering/05-本地产出.md)
