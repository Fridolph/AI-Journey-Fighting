# 第 04 章：Splitter 全览与最终选择

## 本章目标

- 搞清楚 `separator / chunkSize / overlap` 三个核心概念
- 理解 LangChain 常见 Splitter 的差异和适用场景
- 得出一个可执行的工程结论：大多数场景优先用 `RecursiveCharacterTextSplitter`

## 对应源码

- `examples/rag-test/src/tiktoken-test.mjs`
- `examples/rag-test/src/splitters/CharacterTextSplitter-test.mjs`
- `examples/rag-test/src/splitters/RecursiveCharacterTextSplitter-test.mjs`
- `examples/rag-test/src/splitters/TokenTextSplitter-test.mjs`
- `examples/rag-test/src/splitters/recursive-splitter-markdown.mjs`
- `examples/rag-test/src/splitters/recursive-splitter-latex.mjs`
- `examples/rag-test/src/splitters/recursive-splitter-code.mjs`

## 先统一概念

## 1) separator（分隔符）

先按分隔符切语义段（如 `\n`、`。`、`，`、标题符号、代码语法边界）。

## 2) chunkSize（块大小）

把分割后的文本装入 chunk，直到接近阈值。  
实际 chunk 不一定刚好等于 chunkSize，通常会优先保持语义完整。

## 3) chunkOverlap（块重叠）

当文本被拆到相邻 chunk 时，重复一小段上下文，降低“断句失真”。  
常见经验值：`chunkSize` 的 10%~20%。

## 常见 Splitter 对比

## 1) CharacterTextSplitter

- 优点：简单直接
- 缺点：太“死板”，只按单一分隔符，不会智能递归细分
- 在长文本/复杂语义场景容易不理想

## 2) RecursiveCharacterTextSplitter

- 优点：支持多分隔符递归尝试（从粗到细）
- 兼顾语义完整性和 chunk 控制
- 可通过 `lengthFunction` 改成按 token 计数
- 工程上最通用、最推荐

## 3) TokenTextSplitter

- 优点：严格控制 token 数量
- 缺点：可能在语义中间硬切断文本
- 适合“严格 token 预算”场景，不一定适合通用阅读理解

## 4) Markdown / Latex / Code Splitter

- 本质都属于“语法感知的递归切分”
- Markdown：按标题层级等结构分
- Latex：按公式语法分
- Code：可通过 `fromLanguage` 按语言语法边界切

## 这章你可以记住的结论

1. `CharacterTextSplitter` 的能力基本被递归 splitter 覆盖。
2. `TokenTextSplitter` 虽然 token 精准，但可能破坏语义连续性。
3. `RecursiveCharacterTextSplitter` 既灵活又稳，默认优先选它。
4. 需要 token 精准控制时，可以优先考虑给递归 splitter 自定义 `lengthFunction`，而不是直接换成纯 token splitter。

## 易错点

- 误以为 overlap 会加到所有 chunk（实际常在文本被切断时才体现）
- 误以为 chunk 一定等于 chunkSize（通常不是）
- 误把“分得更细”当成“效果一定更好”（过细会导致上下文碎片化）
- 忽略分词器差异：字符长度和 token 长度不等价（`tiktoken-test.mjs` 已验证）

## 一句话总结

> 本章虽然看了很多 splitter，但最终工程策略很简单：**默认用 RecursiveCharacterTextSplitter，再按语料与成本微调参数。**

