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
      { text: '提示词收藏', link: '/prompts/' },
      { text: '概念地图', link: '/agents/concept-map/' },
    ],

    sidebar: {
      '/prompts/': [
        {
          text: '提示词收藏',
          items: [
            { text: '总览', link: '/prompts/' },
            { text: '创意海报', link: '/prompts/creative-posters/' },
            { text: '信息图', link: '/prompts/infographics/' },
            { text: '人像诊断', link: '/prompts/portrait-analysis/' },
            { text: '纪实模拟', link: '/prompts/documentary-sim/' },
          ]
        },
        {
          text: '创意海报',
          collapsed: true,
          items: [
            { text: '任意词视觉化', link: '/prompts/creative-posters/word-visualization' },
            { text: '城市宣传收藏级海报', link: '/prompts/creative-posters/city-poster' },
            { text: '名著经典海报', link: '/prompts/creative-posters/classic-literature' },
            { text: '国风唐诗宋词视觉化海报', link: '/prompts/creative-posters/poetry-poster' },
          ]
        },
        {
          text: '信息图',
          collapsed: true,
          items: [
            { text: '进化史信息图', link: '/prompts/infographics/evolution-history' },
            { text: '博物馆国宝/文物解读图鉴', link: '/prompts/infographics/museum-artifact' },
            { text: '科学百科信息图', link: '/prompts/infographics/science-encyclopedia' },
            { text: '景点建筑信息图', link: '/prompts/infographics/landmark-architecture' },
            { text: '易经卦象与爻辞知识图鉴（母模板）', link: '/prompts/infographics/i-ching-hexagram' },
          ]
        },
        {
          text: '易经六十四卦',
          collapsed: true,
          items: [
            { text: '六十四卦索引', link: '/prompts/infographics/hexagrams/' },
            { text: '乾卦（䷀）', link: '/prompts/infographics/hexagrams/01-乾卦/' },
            { text: '坤卦（䷁）', link: '/prompts/infographics/hexagrams/02-坤卦/' },
            { text: '屯卦（䷂）', link: '/prompts/infographics/hexagrams/03-屯卦/' },
            { text: '蒙卦（䷃）', link: '/prompts/infographics/hexagrams/04-蒙卦/' },
            { text: '需卦（䷄）', link: '/prompts/infographics/hexagrams/05-需卦/' },
            { text: '讼卦（䷅）', link: '/prompts/infographics/hexagrams/06-讼卦/' },
            { text: '师卦（䷆）', link: '/prompts/infographics/hexagrams/07-师卦/' },
            { text: '比卦（䷇）', link: '/prompts/infographics/hexagrams/08-比卦/' },
            { text: '履卦（䷉）', link: '/prompts/infographics/hexagrams/10-履卦/' },
            { text: '小畜卦（䷈）', link: '/prompts/infographics/hexagrams/09-小畜卦/' },
            { text: '泰卦（䷊）', link: '/prompts/infographics/hexagrams/11-泰卦/' },
            { text: '否卦（䷋）', link: '/prompts/infographics/hexagrams/12-否卦/' },
            { text: '同人卦（䷌）', link: '/prompts/infographics/hexagrams/13-同人卦/' },
            { text: '大有卦（䷍）', link: '/prompts/infographics/hexagrams/14-大有卦/' },
            { text: '谦卦（䷎）', link: '/prompts/infographics/hexagrams/15-谦卦/' },
            { text: '豫卦（䷏）', link: '/prompts/infographics/hexagrams/16-豫卦/' },
            { text: '随卦（䷐）', link: '/prompts/infographics/hexagrams/17-随卦/' },
            { text: '蛊卦（䷑）', link: '/prompts/infographics/hexagrams/18-蛊卦/' },
            { text: '临卦（䷒）', link: '/prompts/infographics/hexagrams/19-临卦/' },
            { text: '观卦（䷓）', link: '/prompts/infographics/hexagrams/20-观卦/' },
            { text: '噬嗑卦（䷔）', link: '/prompts/infographics/hexagrams/21-噬嗑卦/' },
            { text: '贲卦（䷕）', link: '/prompts/infographics/hexagrams/22-贲卦/' },
            { text: '剥卦（䷖）', link: '/prompts/infographics/hexagrams/23-剥卦/' },
            { text: '复卦（䷗）', link: '/prompts/infographics/hexagrams/24-复卦/' },
            { text: '无妄卦（䷘）', link: '/prompts/infographics/hexagrams/25-无妄卦/' },
            { text: '大畜卦（䷙）', link: '/prompts/infographics/hexagrams/26-大畜卦/' },
            { text: '颐卦（䷚）', link: '/prompts/infographics/hexagrams/27-颐卦/' },
            { text: '大过卦（䷛）', link: '/prompts/infographics/hexagrams/28-大过卦/' },
            { text: '坎卦（䷜）', link: '/prompts/infographics/hexagrams/29-坎卦/' },
            { text: '离卦（䷝）', link: '/prompts/infographics/hexagrams/30-离卦/' },
            { text: '咸卦（䷞）', link: '/prompts/infographics/hexagrams/31-咸卦/' },
            { text: '恒卦（䷟）', link: '/prompts/infographics/hexagrams/32-恒卦/' },
            { text: '遁卦（䷠）', link: '/prompts/infographics/hexagrams/33-遁卦/' },
            { text: '大壮卦（䷡）', link: '/prompts/infographics/hexagrams/34-大壮卦/' },
            { text: '晋卦（䷢）', link: '/prompts/infographics/hexagrams/35-晋卦/' },
            { text: '明夷卦（䷣）', link: '/prompts/infographics/hexagrams/36-明夷卦/' },
            { text: '家人卦（䷤）', link: '/prompts/infographics/hexagrams/37-家人卦/' },
            { text: '睽卦（䷥）', link: '/prompts/infographics/hexagrams/38-睽卦/' },
            { text: '蹇卦（䷦）', link: '/prompts/infographics/hexagrams/39-蹇卦/' },
            { text: '解卦（䷧）', link: '/prompts/infographics/hexagrams/40-解卦/' },
            { text: '损卦（䷨）', link: '/prompts/infographics/hexagrams/41-损卦/' },
          ]
        },
        {
          text: '人像诊断',
          collapsed: true,
          items: [
            { text: '掌纹算命', link: '/prompts/portrait-analysis/palm-reading' },
            { text: '面相痣相算命', link: '/prompts/portrait-analysis/face-reading' },
            { text: '发型专属优化报告', link: '/prompts/portrait-analysis/hair-optimization' },
          ]
        },
        {
          text: '纪实模拟',
          collapsed: true,
          items: [
            { text: '真实旁观抓拍', link: '/prompts/documentary-sim/bystander-snapshot' },
            { text: '伪纪录片老照片', link: '/prompts/documentary-sim/mockumentary-photo' },
            { text: '报纸头条假新闻', link: '/prompts/documentary-sim/fake-news-headline' },
          ]
        }
      ],
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
