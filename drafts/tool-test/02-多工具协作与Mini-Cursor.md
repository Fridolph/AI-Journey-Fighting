# 第 02 章：多工具协作与 Mini Cursor

## 本章目标

- 从“单工具”升级到“多工具协作”
- 理解一个最小版 Cursor 的执行闭环
- 掌握四类基础工具：读文件、写文件、执行命令、列目录
- 明确工具编排中的关键约束（尤其是 `workingDirectory`）

## 对应源码

- `examples/tool-test/src/all-tools.mjs`
- `examples/tool-test/src/mini-cursor.mjs`

## 本章主线

这一章核心是：把多个 Tool 统一挂到同一个 Agent 上，让模型按任务动态选择工具，完成“创建项目 → 改代码 → 安装依赖 → 启动服务”这一类端到端流程。

## 关键代码理解

### 1) 四个基础工具

`all-tools.mjs` 里定义了：

1. `read_file`：读取文件内容
2. `write_file`：写入文件（自动创建目录）
3. `execute_command`：执行系统命令（支持 `workingDirectory`）
4. `list_directory`：列目录内容

每个工具都包含 `name + description + zod schema + 实现函数`，这是给模型“可理解 + 可调用”的最小结构。

### 2) Agent 循环（Mini Cursor 雏形）

`mini-cursor.mjs` 的 `runAgentWithTools` 做了标准循环：

- 模型先思考并返回 `response`
- 若无 `tool_calls`，直接输出最终答案
- 若有 `tool_calls`，宿主程序逐个执行并把结果封装为 `ToolMessage`
- 再把消息历史交回模型继续思考

这就是一个典型的“ReAct + 工具执行”模式。

### 3) `execute_command` 的关键规则

本章最实用的一点是把“目录切换”规则写进了 System Prompt：

- 指定了 `workingDirectory` 时，不要在命令里再写 `cd ...`
- 错误写法：`cd react-todo-app && pnpm install`
- 正确写法：`{ command: "pnpm install", workingDirectory: "react-todo-app" }`

这是因为 `workingDirectory` 本身就完成了目录切换，再 `cd` 容易导致路径错误。

### 4) 写文件规则的 Prompt 约束

System Prompt 里还加了一个工程化规则：

- 写 React 组件（如 `App.tsx`）时，如果有 `App.css`，要补上 css import

这说明：Prompt 不只是“对话说明”，也可以承载代码生成规范。

## 本章可复用经验

- 工具函数要返回可读文本，方便模型消费
- 工具描述要具体，不然模型不知道什么时候调用
- 命令执行工具要优先考虑可控性（目录、权限、错误提示）
- 日志（成功/失败）要可观察，便于排错

## 易错点

- 误把 `workingDirectory` 和 `cd` 混用
- 工具 schema 定义不完整，导致模型传参错
- 工具执行失败后没有把错误信息回传模型
- 一次给模型过于复杂任务，导致链路难定位

## 一句话总结

> 第 2 章的本质：把多个基础能力拼成“可执行任务流”，这就是 Mini Cursor 的起点。

