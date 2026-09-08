# Tool Choice · step-2 · 指定 Tool vs required

对应学习沉淀：[03-Tool-Choice.md](../../../docs/学习模块/05-Tool-Calling/03-Tool-Choice.md)

## 怎么跑

```bash
cd apps && yarn app:05-03-tool-choice-step-2
```

- **端口**：`50032`
- **浏览器**：http://127.0.0.1:50032/

## 数据流

```text
选档：required | 钉死 query_logistics | 钉死 get_weather
  → POST /api/force
  → 协议 A tool_choice = "required" | {type:function, function:{name}}
  → 对照 firstToolName 是否被钉死（本步不执行 Tool）
```

## 当前能做什么

- 双 Tool（物流 + 天气）下对照「任选」vs「钉死某一个」
- 三档结果常驻；钉死失败 / Provider 无 call / thinking×object 会标色
- 错误：空 query 400；缺 Key 503；thinking 强制 400 教学卡；其它上游 502

## 日志

`logs/{YYYY-MM-DD}.log`
