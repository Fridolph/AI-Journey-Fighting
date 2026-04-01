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
      { text: 'English', link: '/en/' }
    ],

    sidebar: {
      '/': [
        {
          text: 'AI学习记录',
          items: [
            { text: 'AGENTS 总览', link: '/agents/' },
            { text: '大模型基础', link: '/agents/foundation/' },
            { text: '提示词工程', link: '/agents/prompt-engineering/' }
            // { text: 'Agent开发', link: '/agents/agent-development/' },
            // { text: '多模态应用', link: '/agents/multimodal/' },
            // { text: '项目实战', link: '/agents/projects/' },
            // { text: '学习资源', link: '/agents/resources/' }
          ]
        }
      ],
      '/en/': [
        {
          text: 'AI Learning Notes',
          items: [
            { text: 'AGENTS Overview', link: '/en/agents/' },
            { text: 'LLM Foundation', link: '/en/agents/foundation/' },
            { text: 'Prompt Engineering', link: '/en/agents/prompt-engineering/' }
            // { text: 'Agent Development', link: '/en/agents/agent-development/' },
            // { text: 'Multimodal Applications', link: '/en/agents/multimodal/' },
            // { text: 'Project Practice', link: '/en/agents/projects/' },
            // { text: 'Learning Resources', link: '/en/agents/resources/' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Fridolph/AI-Journey-Fighting' }
    ]
  }
})
