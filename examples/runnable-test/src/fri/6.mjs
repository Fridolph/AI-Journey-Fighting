// 练习 ⑥：RunnablePassthrough — 保留原始数据并扩展
// 题目： 输入一个用户对象，给它扩充两个字段后，原始数据不能丢：
// 输入 { name: '李四', age: 28, city: '上海' }
// 在原始对象基础上增加：
//   displayName: '李四（28岁）'
//   isAdult: age >= 18
// 期望输出 { name: '李四', age: 28, city: '上海', displayName: '李四（28岁）', isAdult: true }
// API 提示：
// - import { RunnablePassthrough } from '@langchain/core/runnables'
// - RunnablePassthrough.assign({ key1: fn1, key2: fn2 }) — 类似 Object.assign，保留原有属性 + 新增 key
// 伪代码：
// RunnablePassthrough.assign({
//   displayName: (input) => `${input.name}（${input.age}岁）`,
//   isAdult:     (input) => input.age >= 18,
// }).invoke({ name: '李四', age: 28, city: '上海' })

import { RunnablePassthrough } from '@langchain/core/runnables'


const chain = await RunnablePassthrough.assign({
  displayName: (input) => `${input.name}（${input.age}岁）`,
  isAdult:     (input) => input.age >= 18,
})

const result = await chain.invoke({ name: '李四', age: 28, city: '上海' })
console.log('🚀 ~ :29 ~ result:', result)
