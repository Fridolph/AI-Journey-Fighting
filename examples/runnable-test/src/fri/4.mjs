// 练习 ④：条件分支
// 题目： 根据分数自动判断等级：
// 输入一个数字 { score: 85 }
// ≥ 90  → "优秀"
// ≥ 80  → "良好"  
// ≥ 60  → "及格"
// < 60  → "不及格"
// 期望输出：{ score: 85, level: '良好' }
// API 提示：
// - import { RunnableBranch, RunnableSequence } from '@langchain/core/runnables'
// - RunnableBranch.from([ [条件函数, 处理函数], [条件函数2, 处理函数2], 默认处理函数 ])
// - 条件函数返回 true/false，处理函数返回结果
// - Branch 按顺序匹配，第一个为 true 就执行
// 伪代码：
// branch = RunnableBranch.from([
//   [(input) => input.score >= 90,  (input) => ({ ...input, level: '优秀' })],
//   [(input) => input.score >= 80,  (input) => ({ ...input, level: '良好' })],
//   [(input) => input.score >= 60,  (input) => ({ ...input, level: '及格' })],
//                                  (input) => ({ ...input, level: '不及格' }),
// ])
// branch.invoke({ score: 85 })  // 期望 { score: 85, level: '良好' }
// 试试？顺便测几个边界值：100、59、60。

import { RunnableBranch, RunnableSequence } from '@langchain/core/runnables'

const branch = RunnableBranch.from([
  [
    (input) => input.score >= 90, (input) => ({ ...input, level: '优秀' })
  ],
  [
    (input) => input.score >= 80, (input) => ({ ...input, level: '良好' })
  ],
  [
    (input) => input.score >= 60, (input) => ({ ...input, level: '及格' })
  ],
  (input) => ({ ...input, level: '不及格' }),
])

// 测试
// console.log('🚀 85:', await branch.invoke({ score: 85 }))
// console.log('🚀 100:', await branch.invoke({ score: 100 }))
// console.log('🚀 60:', await branch.invoke({ score: 60 }))
console.log('🚀 59:', await branch.invoke({ score: 59 }))