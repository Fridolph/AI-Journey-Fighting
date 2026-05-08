// 练习 ⑤：RouterRunnable（switch-case）
// 题目： 模拟一个任务调度器，根据 taskType 路由到不同处理器：
// 输入 { taskType: 'email', data: {...} }
// email   → "发送邮件给 {data.to}，内容：{data.content}"
// sms     → "发送短信给 {data.phone}，内容：{data.content}"
// push    → "推送通知给 {data.userId}，内容：{data.content}"
// 期望输出是对应的字符串。
// API 提示：
// - import { RouterRunnable } from '@langchain/core/runnables'
// - new RouterRunnable({ runnables: { email, sms, push } })
// - 调用时传入 { key: 'email', input: { to: '...', content: '...' } }
// - 每个 handler 可以用 PromptTemplate 或箭头函数
// 试试？分别测 email、sms、push 三个路由。

import { RouterRunnable, RunnableLambda } from '@langchain/core/runnables';
const router = new RouterRunnable({
  runnables: {
    email: RunnableLambda.from((input) => `发送邮件给 ${input.to}，内容：${input.content}`),
    sms:   RunnableLambda.from((input) => `发送短信给 ${input.phone}，内容：${input.content}`),
    push:  RunnableLambda.from((input) => `推送通知给 ${input.userId}，内容：${input.content}`),
  },
});
// RouterRunnable 通过 invoke({ key, input }) 自动路由
const response = await router.invoke({ key: 'sms', input: { to: 'fys@qq.com', content: 'hello langchain' } });
console.log('🚀 ~ :26 ~ response:', response)
