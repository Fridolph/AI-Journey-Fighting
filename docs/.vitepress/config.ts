import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AI Journey Fighting',
  description: 'AI学习之旅，记录成长的点点滴滴',
  base: '/AI-Journey-Fighting/',

  // Internationalization configuration
  locales: {
    '/': {
      label: '简体中文',
      lang: 'zh-CN',
      description: 'AI学习之旅，记录成长的点点滴滴'
    },
    '/en/': {
      label: 'English',
      lang: 'en-US',
      description: 'AI Learning Journey, Record Growth'
    }
  },

  themeConfig: {
    // Global navigation (will be overridden per locale if needed)
    nav: [
      { text: '首页', link: '/' },
      { text: '学习记录', link: '/agents/' }
    ],

    // Sidebar configuration per locale
    sidebar: {
      '/': [
        {
          text: 'AI学习记录',
          items: [
            { text: 'AGENTS 总览', link: '/agents/' },
            { text: '大模型基础', link: '/agents/foundation/' }
          ]
        }
      ],
      '/en/': [
        {
          text: 'AI Learning Notes',
          items: [
            { text: 'AGENTS Overview', link: '/en/agents/' },
            { text: 'LLM Foundation', link: '/en/agents/foundation/' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Fridolph/AI-Journey-Fighting' }
    ]
  }
})
