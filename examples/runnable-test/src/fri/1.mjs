// 好，那我们开始第一题，先热个身。
// ---
// 练习 ①：写一条最简单的 Chain
// 题目： 写一个 Runnable，输入一个数字，依次完成：
// 1. 加 5
// 2. 乘以 3
// 3. 减 2
// 用 LCEL 方式组装，最后 invoke(10) 看结果。
// API 提示：
// - import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables'
// - RunnableLambda.from(fn) — 把箭头函数包成 Runnable
// - RunnableSequence.from([step1, step2, step3]) — 顺序串联

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables'

const add5 = RunnableLambda.from(v => v + 5)

const mul3 = RunnableLambda.from(v => v * 3)

const sub2 = RunnableLambda.from(v => v - 2)

const chain = RunnableSequence.from([
    add5,
    mul3,
    sub2,
])

const result = await chain.invoke(10);
console.log(result);