import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AI Journey Fighting',
  description: 'AI学习之旅，记录成长的点点滴滴',
  base: '/AI-Journey-Fighting/',
  lang: 'zh-CN',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '学习记录', link: '/zh/agents/' },
      { text: 'English', link: '/en/agents/' }
    ],
    sidebar: {
      '/zh/': [
        {
          text: 'AI学习记录',
          items: [
            { text: 'AGENTS 总览', link: '/zh/agents/' },
            { text: '大模型基础', link: '/zh/agents/foundation/' },
            { text: '提示词工程', link: '/zh/agents/prompt-engineering/' },
            { text: 'Agent开发', link: '/zh/agents/agent-development/' },
            { text: '多模态应用', link: '/zh/agents/multimodal/' },
            { text: '项目实战', link: '/zh/agents/projects/' },
            { text: '学习资源', link: '/zh/agents/resources/' }
          ]
        }
      ],
      '/en/': [
        {
          text: 'AI Learning Notes',
          items: [
            { text: 'AGENTS Overview', link: '/en/agents/' },
            { text: 'LLM Foundation', link: '/en/agents/foundation/' },
            { text: 'Prompt Engineering', link: '/en/agents/prompt-engineering/' },
            { text: 'Agent Development', link: '/en/agents/agent-development/' },
            { text: 'Multimodal Applications', link: '/en/agents/multimodal/' },
            { text: 'Project Practice', link: '/en/agents/projects/' },
            { text: 'Learning Resources', link: '/en/agents/resources/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/yourusername/AI-Journey-Fighting' }
    ]
  }
})
