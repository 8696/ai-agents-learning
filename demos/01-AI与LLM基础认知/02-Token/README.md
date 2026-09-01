# Demo · Token

对应：[模块 01 · Token](../../docs/学习模块/01-AI与LLM基础认知/02-Token.md)

本条必须看见的：同一段意思，中文 Token 数通常多于英文（计费单位不是「字」也不是「词」）。

用 `gpt-tokenizer` 的 cl100k 词表做量级演示。MiniMax 自己的词表可能不同，方向一致即可。

```bash
cd demos
yarn install
yarn demo:01-02-token
```

不调 API、不消耗额度。这不是五个项目。
