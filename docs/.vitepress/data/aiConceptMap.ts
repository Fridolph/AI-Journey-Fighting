export type ConceptStatus = 'done' | 'learning' | 'next' | 'later'

export interface ConceptGroup {
  id: string
  label: string
  description: string
  color: string
}

export interface ConceptNode {
  id: string
  label: string
  subtitle: string
  groupId: string
  status: ConceptStatus
  x: number
  y: number
  summary: string
  keyQuestion: string
  examples: ConceptResource[]
  experiments: string[]
  docs: ConceptResource[]
}

export interface ConceptLink {
  source: string
  target: string
  label: string
}

export interface ConceptResource {
  label: string
  href: string
}

export const conceptStatusLabels: Record<ConceptStatus, string> = {
  done: '已沉淀',
  learning: '正在连接',
  next: '下一步',
  later: '稍后扩展'
}

const repoBase = 'https://github.com/Fridolph/AI-Journey-Fighting/blob/main'

function sourceFile(label: string, path: string): ConceptResource {
  return {
    label,
    href: `${repoBase}/${path}`
  }
}

function docLink(label: string, href: string): ConceptResource {
  return {
    label,
    href
  }
}

export const conceptGroups: ConceptGroup[] = [
  {
    id: 'foundation',
    label: '基础概念',
    description: '先知道 AI、模型、训练、生成这些词分别在说什么。',
    color: '#2f6f73'
  },
  {
    id: 'generation',
    label: '生成机制',
    description: '理解 LLM 如何把上下文变成一个个 Token。',
    color: '#9a5b28'
  },
  {
    id: 'knowledge',
    label: '知识增强',
    description: '把外部资料、向量检索和模型回答连成闭环。',
    color: '#4867a8'
  },
  {
    id: 'agent',
    label: 'Agent 能力',
    description: '让模型会用工具、会循环、会保留任务状态。',
    color: '#8a4e73'
  },
  {
    id: 'engineering',
    label: '工程化',
    description: '把能跑的 demo 变成可验证、可维护、可复盘的系统。',
    color: '#5d6742'
  }
]

export const conceptNodes: ConceptNode[] = [
  {
    id: 'ai',
    label: 'AI',
    subtitle: '入口概念',
    groupId: 'foundation',
    status: 'done',
    x: 13,
    y: 44,
    summary: 'AI 是整个学习地图的入口，用来回答“机器如何表现出智能”。',
    keyQuestion: '我能不能用一句话说清 AI、机器学习、深度学习的层级关系？',
    examples: [sourceFile('概念文档源码', 'docs/zh/agents/foundation/01-what-is-ai.md')],
    experiments: ['用自己的话写一版“AI / ML / DL / LLM 区别”说明。'],
    docs: [docLink('什么是 AI', '/zh/agents/foundation/01-what-is-ai')]
  },
  {
    id: 'ml-dl',
    label: '机器学习 / 深度学习',
    subtitle: '从规则到学习',
    groupId: 'foundation',
    status: 'done',
    x: 24,
    y: 24,
    summary: '机器学习关注从数据中学习规律，深度学习通过多层神经网络学习更复杂的表示。',
    keyQuestion: '为什么深度学习不是另一种魔法，而是机器学习的一种方法？',
    examples: [
      sourceFile('机器学习文档源码', 'docs/zh/agents/foundation/02-machine-learning.md'),
      sourceFile('深度学习文档源码', 'docs/zh/agents/foundation/03-deep-learning.md')
    ],
    experiments: ['把“规则判断”和“模型学习”各举一个生活例子。'],
    docs: [
      docLink('机器学习', '/zh/agents/foundation/02-machine-learning'),
      docLink('深度学习', '/zh/agents/foundation/03-deep-learning')
    ]
  },
  {
    id: 'training',
    label: '训练机制',
    subtitle: '误差如何变小',
    groupId: 'foundation',
    status: 'done',
    x: 42,
    y: 16,
    summary: '反向传播、损失函数、梯度下降、过拟合和正则化共同解释了模型如何被训练出来。',
    keyQuestion: '模型为什么会变好，又为什么可能只是在“背题”？',
    examples: [
      sourceFile('反向传播文档源码', 'docs/zh/agents/foundation/05-backpropagation.md'),
      sourceFile('损失函数文档源码', 'docs/zh/agents/foundation/20-loss-function.md'),
      sourceFile('梯度下降文档源码', 'docs/zh/agents/foundation/21-gradient-descent.md')
    ],
    experiments: ['用“考试刷题”类比解释过拟合和验证集。'],
    docs: [
      docLink('反向传播', '/zh/agents/foundation/05-backpropagation'),
      docLink('损失函数', '/zh/agents/foundation/20-loss-function'),
      docLink('梯度下降', '/zh/agents/foundation/21-gradient-descent')
    ]
  },
  {
    id: 'transformer',
    label: 'Transformer',
    subtitle: 'LLM 的骨架',
    groupId: 'generation',
    status: 'done',
    x: 44,
    y: 42,
    summary: 'Transformer 用 Attention 建立 Token 之间的关系，是理解现代大模型的关键结构。',
    keyQuestion: 'Attention 到底在“看”什么？它为什么适合处理上下文？',
    examples: [
      sourceFile('Transformer 文档源码', 'docs/zh/agents/foundation/11-transformer.md'),
      sourceFile('Attention 文档源码', 'docs/zh/agents/foundation/15-attention.md')
    ],
    experiments: ['拿一句话标出每个词最依赖的上下文词。'],
    docs: [
      docLink('Transformer', '/zh/agents/foundation/11-transformer'),
      docLink('Attention', '/zh/agents/foundation/15-attention')
    ]
  },
  {
    id: 'llm',
    label: 'LLM',
    subtitle: '语言生成引擎',
    groupId: 'generation',
    status: 'done',
    x: 62,
    y: 34,
    summary: 'LLM 根据上下文预测下一个 Token，预训练、微调、采样共同影响它的输出方式。',
    keyQuestion: '为什么 LLM 是“预测下一个 Token”，却能表现得像在回答问题？',
    examples: [
      sourceFile('LLM 文档源码', 'docs/zh/agents/foundation/10-llm.md'),
      sourceFile('预训练与微调文档源码', 'docs/zh/agents/foundation/12-pretraining-finetuning.md')
    ],
    experiments: ['调高 temperature，观察同一个问题的回答稳定性变化。'],
    docs: [
      docLink('大语言模型', '/zh/agents/foundation/10-llm'),
      docLink('预训练与微调', '/zh/agents/foundation/12-pretraining-finetuning')
    ]
  },
  {
    id: 'prompt',
    label: 'Prompt Engineering',
    subtitle: '控制输入方式',
    groupId: 'generation',
    status: 'done',
    x: 78,
    y: 22,
    summary: 'Prompt 是给模型设置任务、角色、边界和输出要求的主要接口。',
    keyQuestion: '我是在“写提示词”，还是在设计模型完成任务的上下文？',
    examples: [sourceFile('Prompt 示例目录', 'examples/prompt-template-test/src')],
    experiments: ['删掉 system prompt 的限制，观察工具调用或回答风格怎么变化。'],
    docs: [docLink('提示词工程', '/zh/agents/prompt-engineering/22-prompt-engineering')]
  },
  {
    id: 'embedding',
    label: 'Embedding',
    subtitle: '文本变坐标',
    groupId: 'knowledge',
    status: 'done',
    x: 28,
    y: 68,
    summary: 'Embedding 把文本转成向量，让“语义相近”可以被计算和检索。',
    keyQuestion: '为什么两个不同句子可以因为语义相近而被检索到？',
    examples: [
      sourceFile('RAG 示例目录', 'examples/rag-test/src'),
      sourceFile('检索记忆示例', 'examples/memory-test/src/memory/retrieval-memory.pro.mjs')
    ],
    experiments: ['替换 Embedding 模型，比较相同查询召回内容是否变化。'],
    docs: [docLink('Embedding', '/zh/agents/foundation/14-embedding')]
  },
  {
    id: 'vector-db',
    label: 'Vector DB',
    subtitle: '语义索引',
    groupId: 'knowledge',
    status: 'learning',
    x: 46,
    y: 76,
    summary: '向量数据库负责存储和检索 Embedding，是 RAG 和长期记忆的底层能力。',
    keyQuestion: '数据库查的是关键词、元数据，还是语义距离？',
    examples: [
      sourceFile('Milvus 示例目录', 'examples/milvus-test/src'),
      sourceFile('Milvus 备份脚本', 'scripts/milvus-backup.sh')
    ],
    experiments: ['调整 topK 或相似度阈值，看 RAG 回答质量怎么变化。'],
    docs: [sourceFile('Milvus 查询示例', 'examples/milvus-test/src/query.mjs')]
  },
  {
    id: 'rag',
    label: 'RAG',
    subtitle: '检索增强生成',
    groupId: 'knowledge',
    status: 'learning',
    x: 64,
    y: 70,
    summary: 'RAG 用检索结果补充 LLM 上下文，让模型基于外部资料回答。',
    keyQuestion: 'LLM 是在记忆答案，还是在阅读我检索出来的材料？',
    examples: [
      sourceFile('Hello RAG 示例', 'examples/rag-test/src/hello-rag.mjs'),
      sourceFile('RAG Pipeline v4', 'examples/resume-memory-rag-qa/src/rag4/rag-pipeline-v4.mjs')
    ],
    experiments: ['打印 query、召回片段、最终 prompt，观察回答依赖哪一步。'],
    docs: [docLink('RAG', '/zh/agents/foundation/19-rag')]
  },
  {
    id: 'tool-calling',
    label: 'Tool Calling',
    subtitle: '模型调用外部能力',
    groupId: 'agent',
    status: 'learning',
    x: 82,
    y: 48,
    summary: 'Tool Calling 让 LLM 不只生成文本，还能选择工具、生成参数并读取工具结果。',
    keyQuestion: '模型什么时候应该回答，什么时候应该调用工具？',
    examples: [
      sourceFile('工具调用示例', 'examples/tool-test/src/all-tools.mjs'),
      sourceFile('mini-cursor 示例', 'examples/tool-test/src/mini-cursor.mjs')
    ],
    experiments: ['去掉 tool_call_id，观察多工具结果和模型消息如何失去对应关系。'],
    docs: [docLink('Agent 开发', '/zh/agents/agent-development/')]
  },
  {
    id: 'agent-loop',
    label: 'Agent Loop',
    subtitle: '循环直到完成',
    groupId: 'agent',
    status: 'learning',
    x: 88,
    y: 68,
    summary: 'Agent Loop 把“思考、调用工具、接收结果、继续判断”连成一个可执行循环。',
    keyQuestion: '循环退出条件是什么？如果没有限制会发生什么？',
    examples: [sourceFile('mini-cursor 源码', 'examples/tool-test/src/mini-cursor.mjs')],
    experiments: ['把 maxIterations 改成 2，观察任务在哪一轮被迫停止。'],
    docs: [docLink('Agent 开发', '/zh/agents/agent-development/')]
  },
  {
    id: 'memory',
    label: 'Memory / History',
    subtitle: '上下文与记忆',
    groupId: 'agent',
    status: 'learning',
    x: 74,
    y: 86,
    summary: 'Memory 负责保留对话历史、摘要或可检索记忆，让多轮任务能延续。',
    keyQuestion: '短期上下文、长期记忆、向量检索记忆分别解决什么问题？',
    examples: [
      sourceFile('Memory 示例目录', 'examples/memory-test/src'),
      sourceFile('Memory 学习草稿目录', 'drafts/memory-test')
    ],
    experiments: ['打印每轮 messages，观察历史长度如何影响模型决策。'],
    docs: [
      sourceFile('Memory 示例源码', 'examples/memory-test/src/history-test.mjs'),
      sourceFile('Memory 学习草稿', 'drafts/memory-test/01-Memory基础与History持久化.md')
    ]
  },
  {
    id: 'langgraph',
    label: 'LangGraph',
    subtitle: 'Agent 状态机',
    groupId: 'engineering',
    status: 'next',
    x: 86,
    y: 28,
    summary: 'LangGraph 把 Agent Loop 显式建模为节点、边和状态，适合控制复杂流程。',
    keyQuestion: '哪些步骤应该变成节点？哪些判断应该变成条件边？',
    examples: [sourceFile('LangGraph 示例目录', 'examples/langgraph-test/src')],
    experiments: ['把 mini-cursor 的循环改写成 graph：model 节点、tool 节点、shouldContinue 边。'],
    docs: [
      sourceFile('LangGraph 示例源码', 'examples/langgraph-test/src/basic-graph.mjs'),
      sourceFile('LangGraph 预构建 Agent', 'examples/langgraph-test/src/prebuilt-agent.mjs')
    ]
  },
  {
    id: 'structured-output',
    label: 'Structured Output',
    subtitle: '稳定 JSON 输出',
    groupId: 'engineering',
    status: 'next',
    x: 64,
    y: 12,
    summary: '结构化输出用 Schema 约束模型返回，让 AI 能稳定进入业务系统。',
    keyQuestion: '我需要自然语言答案，还是需要后端可以直接消费的数据？',
    examples: [sourceFile('Structured Output 示例目录', 'examples/output-parser-test/src')],
    experiments: ['故意增加必填字段，观察 parser 和模型输出如何失败或修复。'],
    docs: [
      sourceFile('结构化输出示例', 'examples/output-parser-test/src/with-structured-output.mjs'),
      sourceFile('JSON Schema 示例', 'examples/output-parser-test/src/structured-json-schema.mjs')
    ]
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    subtitle: '质量评测',
    groupId: 'engineering',
    status: 'later',
    x: 52,
    y: 92,
    summary: 'Evaluation 用测试集、指标和人工复盘判断 RAG / Agent 是否真的变好。',
    keyQuestion: '我怎么知道这次 Prompt、召回或 Agent 改动不是只对一个例子有效？',
    examples: [sourceFile('RAG 测试样例目录', 'examples/rag-test/tests')],
    experiments: ['为 RAG 准备 10 个固定问题，每次修改后记录命中率和答案依据。'],
    docs: [
      sourceFile('RAG 测试材料', 'examples/rag-test/tests/rag-test-base.md'),
      sourceFile('RAG 大样本测试', 'examples/rag-test/tests/rag-test-large.md')
    ]
  }
]

export const conceptLinks: ConceptLink[] = [
  { source: 'ai', target: 'ml-dl', label: '包含' },
  { source: 'ml-dl', target: 'training', label: '训练出模型' },
  { source: 'training', target: 'transformer', label: '支撑架构理解' },
  { source: 'transformer', target: 'llm', label: '构成' },
  { source: 'llm', target: 'prompt', label: '被输入控制' },
  { source: 'transformer', target: 'embedding', label: '表示能力' },
  { source: 'embedding', target: 'vector-db', label: '写入 / 查询' },
  { source: 'vector-db', target: 'rag', label: '召回资料' },
  { source: 'rag', target: 'llm', label: '补上下文' },
  { source: 'prompt', target: 'tool-calling', label: '约束工具使用' },
  { source: 'tool-calling', target: 'agent-loop', label: '进入循环' },
  { source: 'agent-loop', target: 'memory', label: '沉淀历史' },
  { source: 'memory', target: 'rag', label: '检索记忆' },
  { source: 'agent-loop', target: 'langgraph', label: '显式状态机' },
  { source: 'llm', target: 'structured-output', label: '约束输出' },
  { source: 'rag', target: 'evaluation', label: '需要评测' },
  { source: 'agent-loop', target: 'evaluation', label: '验证行为' }
]
