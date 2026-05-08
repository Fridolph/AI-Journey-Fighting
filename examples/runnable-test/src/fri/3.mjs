
// 练习 ③：顺序 + 并行混用
// 题目： 处理一段文本，流程如下：
// 输入：一段原始文本，如 "  Hello   World   from   LangChain  "
// 步骤 1（顺序）：清洗文本 — 去首尾空格 + 合并多余空格
// 步骤 2（并行）：
//     A. 转大写     → key: 'upper'
//     B. 转小写     → key: 'lower'  
//     C. 统计字数   → key: 'wordCount'
//     D. 统计字符数 → key: 'charCount'
// 步骤 3（顺序）：在结果里加个时间戳 → key: 'timestamp'
// 期望输出：
// { upper: 'HELLO WORLD FROM LANGCHAIN', lower: 'hello world from langchain', wordCount: 4, charCount: 28, timestamp: '...' }
// API 提示：
// - RunnableSequence.from([step1, step2, step3]) — 串行
// - RunnableMap.from({ a: fnA, b: fnB }) — 并行
// - 箭头函数直接写进数组/对象，LangChain 自动转 RunnableLambda
// - Date.now() 可以拿时间戳
// - 文本清洗：text.trim().replace(/\s+/g, ' ')
// 伪代码：
// clean = (text) => text.trim().replace(/\s+/g, ' ')
// parallel = RunnableMap.from({
//   upper:     (text) => text.toUpperCase(),
//   lower:     (text) => text.toLowerCase(),
//   wordCount: (text) => text.split(' ').length,
//   charCount: (text) => text.length,
// })
// addTime = (obj) => ({ ...obj, timestamp: Date.now() })
// chain = RunnableSequence.from([clean, parallel, addTime])
// chain.invoke("  Hello   World   from   LangChain  ")
// 试试？注意这一步里 RunnableMap 是嵌在 RunnableSequence 中间的，数据流是：文本 → 清洗 → 并行处理 → 加时间戳。

import { RunnableSequence, RunnableMap } from '@langchain/core/runnables'

const sourceText = '  Hello   World   from   LangChain  '

const clean = (text) => text.trim().replace(/\s+/g, ' ')
const parallel = await RunnableMap.from({
  upper:     (text) => text.toUpperCase(),
  lower:     (text) => text.toLowerCase(),
  wordCount: (text) => text.split(' ').length,
  charCount: (text) => text.length,
})
const addTime = (obj) => ({ ...obj, timestamp: Date.now() })
const joinText = (obj) => {
    let ret = ''
    ret += `Today is ${new Date(obj.timestamp).toDateString()}. `
    ret += obj.upper.slice(0, 1)
    ret += obj.lower.slice(1)
    return {
        ...obj,
        para: ret,
    }
}

const chain = await RunnableSequence.from([
    clean, 
    parallel, 
    addTime,
    joinText,
])

const result = await chain.invoke(sourceText)

console.log('🚀 result:', result)
