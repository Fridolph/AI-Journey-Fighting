# 第 01 章：withStructuredOutput 兼容性踩坑记录

## 背景

在 `output-parser-test` 这一章里，原始示例希望展示的是：

- `withStructuredOutput`
- `output parser`
- `tool call`

三者在结构化输出场景下的关系。

按教程思路，`with-structured-output.mjs` 应该是一个最省心的例子：

- 给一个 `zod schema`
- 调用 `withStructuredOutput`
- 最后直接拿到结构化结果对象

但在我本地实际运行时，代码并没有像预期那样一次跑通，而是连续暴露出了两层兼容性问题。

这次排查很有价值，因为它让我真正理解了：

> **“OpenAI 兼容接口”不等于“完全支持 OpenAI 的所有结构化输出协议”。**

---

## 原始现象

运行原始脚本：

- `examples/output-parser-test/src/with-structured-output.mjs`

报出了第一层错误：

```txt
BadRequestError: 400 This response_format type is unavailable now
```

之后在尝试修复时，又进一步遇到了第二层错误：

```txt
BadRequestError: 400 deepseek-reasoner does not support this tool_choice
```

也就是说，这次不是一个单点问题，而是：

1. 第一种结构化方式不支持
2. 换第二种方式后，当前模型又不支持

---

## 这次问题为什么会出现

### 1. `withStructuredOutput` 背后不是单一实现

`withStructuredOutput` 看起来像一个统一 API，但底层其实可能走不同模式：

- `jsonSchema`
- `functionCalling`
- `jsonMode`

也就是说，它不是“固定某一种结构化输出实现”，而是：

> **LangChain 根据当前模型能力，自动帮你挑一种它认为合适的方式。**

这也是它好用的地方，但也正因为这样，兼容性问题会被“隐藏起来”，直到你实际调用时才暴露。

### 2. 第一层错误：当前供应商不支持 `json_schema`

从报错：

```txt
This response_format type is unavailable now
```

可以确认，当前端点并不支持：

```js
response_format: { type: "json_schema" }
```

也就是说，`withStructuredOutput` 默认帮我选到的那条路径，在这个兼容接口上并不能工作。

这就说明：

- 不是 `withStructuredOutput` API 用法错了
- 而是底层自动选择的方法，超出了当前供应商的能力范围

### 3. 第二层错误：当前模型又不支持 `tool_choice`

我接着把方式改成了 `functionCalling`，本意是：

- 既然 `json_schema` 不支持
- 那就退回到更常见的 tool call 结构化方式

但这时又遇到：

```txt
deepseek-reasoner does not support this tool_choice
```

这说明第二个现实问题：

- 当前模型 / 当前兼容端点
- 连“强制使用某个 tool”这条路径都不支持

也就是说，这次环境不是“只换一种结构化方法就好”，而是：

- `jsonSchema` 不支持
- `functionCalling` 也不稳定

这时就只能继续退一层。

---

## 这次排查后我真正理解到的事

### 1. `withStructuredOutput` 很方便，但不能想当然认为所有兼容模型都能直接用

之前容易有一种错觉：

- 既然是 `OpenAI` 兼容接口
- 那 `withStructuredOutput` 应该也能直接跑

但真实情况是：

- 有的兼容端点支持普通聊天
- 有的兼容端点支持工具调用
- 有的支持 JSON mode
- 但不一定全部支持 `json_schema`

所以这次让我意识到：

> **兼容接口的“兼容”，通常只是基础调用兼容，不代表高级协议也完全兼容。**

### 2. 结构化输出不是只有“能不能结构化”这一层，还要分具体协议

这次最有帮助的理解是，结构化输出其实可以进一步拆成：

- `jsonSchema`
  - 更强、更正式，但要求模型 / 平台支持 `response_format`

- `functionCalling`
  - 更偏 tool call 路线，需要模型支持 `tool_choice / tool_calls`

- `jsonMode`
  - 更基础的 JSON 输出模式，只要模型能按照 prompt 返回合法 JSON，就更容易兼容

所以以后不能只说：

- “这个模型支持结构化输出”

而要进一步问：

- 它支持的是哪一种结构化输出方式？

### 3. `output parser` 仍然很重要

这次踩坑反而让我更理解教程后半段那句结论：

> `withStructuredOutput` 不是万能的，`output parser` 仍然有自己的位置。

尤其当：

- 当前模型的 tool call 能力不稳定
- `json_schema` 不支持
- 只是想拿到一个 JSON 结果

这时退回：

- `jsonMode`
- 或直接 `StructuredOutputParser`

反而更稳、更通用。

---

## 这次我是怎么修的

按照“学习示例不改原文件”的规则，这次没有直接改：

- `with-structured-output.mjs`

而是新建了：

- `with-structured-output-fix.mjs`

文件位置：

- `examples/output-parser-test/src/with-structured-output-fix.mjs`

### 修复思路

我这次采用的是“分供应商/分能力退让”的兼容策略：

1. 优先判断当前是不是 `DeepSeek` 兼容端点
2. 或者当前模型名是否包含 `reasoner`
3. 如果命中这些情况：
   - 不再强行走 `functionCalling`
   - 改走 `jsonMode`
4. 同时在 prompt 里明确写上：
   - “请以 JSON 格式返回”

为什么要补这句？

因为 `jsonMode` 本身对 prompt 有更明显的依赖，如果你不明确要求 `JSON`，有些接口还会直接报错。

---

## 修复后的实际策略

最终这次的兼容处理可以总结成一句话：

### 普通情况

- 优先尝试 `functionCalling`

### 当前模型 / 供应商不支持 tool call 强约束时

- 退回 `jsonMode`

### 如果后面再遇到更复杂的不兼容

- 再退回到 `output parser`

也就是说，结构化输出的选择顺序不是绝对固定的，而是要看：

1. 当前模型支持什么
2. 当前供应商开放了什么协议
3. 我这次到底是想要“最稳”还是“最通用”

---

## 这次踩坑对这一章学习的补充理解

原本看教程时，容易得到一个简单结论：

- `withStructuredOutput` 最方便
- 所以以后都优先用它

但这次实际跑下来，我会把结论修正为：

> **如果模型和供应商都支持，`withStructuredOutput` 确实最省心；但一旦进入兼容接口场景，就不能只看 API 名字，而要看它底层会走哪种结构化协议。**

所以现在我对这一章的理解变成了：

### `withStructuredOutput`

- 适合普通结构化输出场景
- 但需要警惕模型兼容性

### `functionCalling`

- 结构化最稳的一种路线
- 但前提是模型真的支持 tool call

### `jsonSchema`

- 能力更正式
- 但兼容接口未必支持

### `jsonMode`

- 更基础
- 更容易兼容
- 是很多“兼容接口场景”的兜底方案

### `output parser`

- 对流式输出、XML、兼容模型兜底都仍然很重要

---

## 当前结论

这次 `withStructuredOutput` 的报错，不是“代码写错了”，而是：

> **LangChain 默认帮我选的结构化输出协议，超出了当前供应商 / 当前模型的支持范围。**

所以这次真正该记住的不是某一行修复代码，而是下面这条判断顺序：

1. 先看当前模型/供应商支不支持 `json_schema`
2. 再看它支不支持 `tool_choice / tool_calls`
3. 如果这两条都不稳，就退回 `jsonMode`
4. 如果还要更通用或更流式，再考虑 `output parser`

一句话总结：

> **结构化输出不是“只会一种方法”，而是要根据模型能力在 `jsonSchema / functionCalling / jsonMode / output parser` 之间做合适选择。**

