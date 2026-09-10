function stripJsComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * 双引号 / 模板字符串里塞了 {"<tag>"} —— Babel 会截断或原样显示。
 * JSX 子节点 `{"<think>"}` 合法：`{` 在字符串外面，`"<think>"` 本身不含 `{`。
 * 禁止用 /"[^"]*\{\s*"</ 这种跨行正则：会把 className="x"> 的收尾引号
 * 和后面的 JSX 表达式拼成误报。
 */
function braceQuoteInJsString(code) {
  const src = stripJsComments(code);
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let content = "";
      while (i < src.length) {
        if (src[i] === "\\") {
          content += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        if (src[i] === q) break;
        content += src[i];
        i++;
      }
      const after = src[i + 1] || "";
      // 双引号在 `{` 后被截断：内容以 `{` 结尾，下一个字符是 `<`
      if (/\{\s*$/.test(content) && after === "<") return true;
      if (/\{\s*"<[\w/-]+>/.test(content)) return true;
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      let content = "";
      while (i < src.length) {
        if (src[i] === "\\") {
          content += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        if (src[i] === "`") break;
        if (src[i] === "$" && src[i + 1] === "{") {
          content += "${";
          i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            if (depth > 0) content += src[i];
            i++;
          }
          continue;
        }
        content += src[i];
        i++;
      }
      if (/\{\s*"<[\w/-]+>/.test(content)) return true;
      i++;
      continue;
    }
    i++;
  }
  return false;
}

function selfCheckBraceQuote() {
  const cases = [
    ["jsx-text", '<span>无 {"<think>"} 块</span>', false],
    ["attr-then-jsx", 'className="text-xs">还没有 {"<think>"}</p>', false],
    ["dbl-trunc", '"独立字段还是嵌 {"<think>"}"', true],
    ["tmpl", '`网关剥 {"<think>"} 后再 parse`', true],
    ["plain-lt", '"a < b"', false],
  ];
  for (const [name, sample, want] of cases) {
    const got = braceQuoteInJsString(sample);
    if (got !== want) {
      console.error("self-check fail " + name + " got=" + got + " want=" + want);
      process.exit(2);
    }
  }
}

module.exports = { stripJsComments, braceQuoteInJsString, selfCheckBraceQuote };
