// 练习 ②：并行处理 + 结果合并
// 题目： 输入一名员工的信息对象，同时并行做三件事，最终结果合并到一个对象里：
// 输入：
// { name: '张三', salary: 15000, department: '技术部' }
// 并行处理：
//   ① 加薪 20%，结果放在 key: 'newSalary'
//   ② 生成欢迎语 "你好，{name}！欢迎加入{department}"，结果放在 key: 'greeting'  
//   ③ 计算年薪（月薪 × 12），结果放在 key: 'annualSalary'
// 期望输出：
// { newSalary: 18000, greeting: '你好，张三！欢迎加入技术部', annualSalary: 180000 }
// API 提示：
// - import { RunnableMap } from '@langchain/core/runnables'
// - RunnableMap.from({ key1: fn1, key2: fn2, ... }) — 并行执行，结果按 key 合并
// - 箭头函数可以自动识别为 RunnableLambda，不用显式包 RunnableLambda.from()
// - PromptTemplate.fromTemplate('你好，{name}！欢迎加入{department}') 也可以放进 Map
// 伪代码：
// RunnableMap.from({
//   newSalary:    (input) => input.salary * 1.2,
//   greeting:     PromptTemplate.fromTemplate('你好，{name}！欢迎加入{department}'),
//   annualSalary: (input) => input.salary * 12,
// }).invoke({ name: '张三', salary: 15000, department: '技术部' })

import { RunnableMap } from '@langchain/core/runnables'
import { PromptTemplate } from "@langchain/core/prompts";

const input = { name: '张三', salary: 15000, department: '技术部' }

const newSalary = (input) => input.salary * 1.2
const greeting = PromptTemplate.fromTemplate('你好，{name}！欢迎加入{department}')
const annualSalary = (input) => input.salary * 13

const result = await RunnableMap.from({
  newSalary,
  greeting,
  annualSalary
}).invoke(input);

console.log('🚀 result:', result)
