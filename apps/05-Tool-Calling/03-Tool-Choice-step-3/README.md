# Tool Choice · step-3 · 用户开关映射

对应学习沉淀：[03-Tool-Choice.md](../../../docs/学习模块/05-Tool-Calling/03-Tool-Choice.md)

## 怎么跑

```bash
cd apps && yarn app:05-03-tool-choice-step-3
```

- **端口**：`50033`
- **浏览器**：http://127.0.0.1:50033/

## 数据流

```text
产品开关（只聊天 / 允许工具 / 强制查库）
  → 映射 none / auto / required
  → POST /api/switch
  → 协议 A chat.completions（本步不执行 Tool）
  → 三档常驻对照 + 映射表
```

## 当前能做什么

- 展示「用户点开关 ≠ 口头说说」；请求卡片写明 mappingNote
- 三开关结果常驻；只聊天/强制查库做协议判定
- thinking×强制 仍出琥珀色教学卡

## 日志

`logs/{YYYY-MM-DD}.log`
