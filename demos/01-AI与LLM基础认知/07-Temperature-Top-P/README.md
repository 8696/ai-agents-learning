# Demo · Temperature / Top-P

对应：[模块 01 · Temperature / Top-P](../../docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P.md)

本条必须看见的：同一句 prompt，`temperature=0` 两次几乎一样；`temperature` 调高后两次更容易分叉。Top-P 本 Demo 固定为 1（多数文档建议先只调温度）。

```bash
cd demos
yarn install
yarn demo:01-temperature
```

需要已填 `apps/.env` 的 `MINIMAX_API_KEY`。会打 4 次短请求。若模型夹了思考过程，脚本会剥掉再比「四个字」本身。这不是五个项目。
