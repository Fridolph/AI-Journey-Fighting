import { defineConfig } from 'vitepress'
import mathjax3 from 'markdown-it-mathjax3'

export default defineConfig({
  title: 'AI Journey Fighting',
  description: 'AI学习之旅，记录成长的点点滴滴',
  base: '/AI-Journey-Fighting/',
  lang: 'zh-CN',

  // Markdown configuration
  markdown: {
    config: (md) => {
      md.use(mathjax3)
    }
  },

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '学习记录', link: '/agents/' },
      { text: '已发表文章', link: '/articles/' },
      { text: '概念地图', link: '/agents/concept-map/' },
    ],

    sidebar: {
      '/articles/': [
        {
          text: '已发表文章',
          items: [
            { text: '文章总览', link: '/articles/' },
            { text: '一、提示链、路由、并行化', link: '/articles/2026-03-01__learn-ai-1/' },
            { text: '二、反思、工具使用、规划', link: '/articles/2026-03-02__learn-ai-2/' },
            { text: '三、多智能体、记忆管理与学习适应', link: '/articles/2026-03-08__learn-ai-3/' },
            { text: '四、MCP：给AI工具世界造一个USB接口', link: '/articles/2026-03-12__learn-ai-4/' },
            { text: '五、目标、监控与容错', link: '/articles/2026-03-15__learn-ai-5/' },
            { text: '六、Human-in-the-Loop 设计', link: '/articles/2026-03-17__learn-ai-6/' },
            { text: '七、深入理解 RAG', link: '/articles/2026-03-17__learn-ai-7/' },
            { text: '八、A2A 协议完全指南', link: '/articles/2026-03-17__learn-ai-8/' },
            { text: '九、Multi-Agent 系统设计：架构与编排', link: '/articles/2026-03-24__learn-ai-9/' },
            { text: '十、Multi-Agent 系统设计：成本优化与容错机制', link: '/articles/2026-03-27__learn-ai-10/' },
            { text: '十一、Multi-Agent 系统设计：可观测性与生产实践', link: '/articles/2026-03-29__learn-ai-11/' },
            { text: '十二、RAG 知识库设计', link: '/articles/2026-04-04__learn-ai-12/' },
            { text: '十三、Agent 安全：给 AI 装上护栏', link: '/articles/2026-04-07__learn-ai-13/' },
            { text: '十四、从零推导 Multi-Agent 架构设计', link: '/articles/2026-04-10__learn-ai-14/' },
            { text: '二十一、从零推导 Agent 工作机制', link: '/articles/2026-04-12__learn-ai-15/' }
          ]
        }
      ],
      '/': [
        {
          text: 'AI学习记录',
          items: [
            { text: 'AGENTS 总览', link: '/agents/' },
            { text: 'AI 概念地图', link: '/agents/concept-map/' },
            { text: '概念地图维护说明', link: '/agents/concept-map/maintain' },
            { text: '大模型基础', link: '/agents/foundation/' },
            { text: '提示词工程', link: '/agents/prompt-engineering/' },
            { text: 'Agent开发', link: '/agents/agent-development/' },
            { text: '多模态应用', link: '/agents/multimodal/' },
            { text: '项目实战', link: '/agents/projects/' },
            { text: '学习资源', link: '/agents/resources/' }
          ]
        },
        {
          text: '阶段输出',
          items: [
            { text: '已发表文章', link: '/articles/' },
            { text: '学习进度总结', link: '/records/2026-03-27' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Fridolph/AI-Journey-Fighting' }
    ]
  }
})
