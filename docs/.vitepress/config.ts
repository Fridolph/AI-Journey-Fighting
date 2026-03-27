import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AI Journey Fighting',
  description: 'AI学习之旅，记录成长的点点滴滴',
  base: '/AI-Journey-Fighting/',
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      description: 'AI学习之旅，记录成长的点点滴滴',
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '学习记录', link: '/agents/' }
        ],
        sidebar: [
          {
            text: 'AI学习记录',
            items: [
              { text: 'AGENTS 总览', link: '/agents/' },
              { text: '大模型基础', link: '/agents/foundation/' }
              // { text: '提示词工程', link: '/agents/prompt-engineering/' },
              // { text: 'Agent开发', link: '/agents/agent-development/' },
              // { text: '多模态应用', link: '/agents/multimodal/' },
              // { text: '项目实战', link: '/agents/projects/' },
              // { text: '学习资源', link: '/agents/resources/' }
            ]
          }
        ]
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      description: 'AI Learning Journey, Record Growth',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Learning Notes', link: '/agents/' }
        ],
        sidebar: [
          {
            text: 'AI Learning Notes',
            items: [
              { text: 'AGENTS Overview', link: '/agents/' },
              { text: 'LLM Foundation', link: '/agents/foundation/' }
              // { text: 'Prompt Engineering', link: '/agents/prompt-engineering/' },
              // { text: 'Agent Development', link: '/agents/agent-development/' },
              // { text: 'Multimodal Applications', link: '/agents/multimodal/' },
              // { text: 'Project Practice', link: '/agents/projects/' },
              // { text: 'Learning Resources', link: '/agents/resources/' }
            ]
          }
        ]
      }
    }
  },
  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Fridolph/AI-Journey-Fighting' }
    ]
  }
})
