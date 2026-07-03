import { defineConfig } from 'vitepress'
import mathjax3 from 'markdown-it-mathjax3'

export default defineConfig({
  title: 'AI Journey Fighting',
  description: '霪霖笙箫 的 AI & 全栈学习之旅 · 记录成长',
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
            { text: '前端工程', link: '/prompts/frontend-engineering/' },
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
            { text: '益卦（䷩）', link: '/prompts/infographics/hexagrams/42-益卦/' },
            { text: '夬卦（䷪）', link: '/prompts/infographics/hexagrams/43-夬卦/' },
            { text: '姤卦（䷫）', link: '/prompts/infographics/hexagrams/44-姤卦/' },
            { text: '萃卦（䷬）', link: '/prompts/infographics/hexagrams/45-萃卦/' },
            { text: '升卦（䷭）', link: '/prompts/infographics/hexagrams/46-升卦/' },
            { text: '困卦（䷮）', link: '/prompts/infographics/hexagrams/47-困卦/' },
            { text: '井卦（䷯）', link: '/prompts/infographics/hexagrams/48-井卦/' },
            { text: '革卦（䷰）', link: '/prompts/infographics/hexagrams/49-革卦/' },
            { text: '鼎卦（䷱）', link: '/prompts/infographics/hexagrams/50-鼎卦/' },
            { text: '震卦（䷲）', link: '/prompts/infographics/hexagrams/51-震卦/' },
            { text: '艮卦（䷳）', link: '/prompts/infographics/hexagrams/52-艮卦/' },
            { text: '渐卦（䷴）', link: '/prompts/infographics/hexagrams/53-渐卦/' },
            { text: '归妹卦（䷵）', link: '/prompts/infographics/hexagrams/54-归妹卦/' },
            { text: '丰卦（䷶）', link: '/prompts/infographics/hexagrams/55-丰卦/' },
            { text: '旅卦（䷷）', link: '/prompts/infographics/hexagrams/56-旅卦/' },
            { text: '巽卦（䷸）', link: '/prompts/infographics/hexagrams/57-巽卦/' },
            { text: '兑卦（䷹）', link: '/prompts/infographics/hexagrams/58-兑卦/' },
            { text: '涣卦（䷺）', link: '/prompts/infographics/hexagrams/59-涣卦/' },
            { text: '节卦（䷻）', link: '/prompts/infographics/hexagrams/60-节卦/' },
            { text: '中孚卦（䷼）', link: '/prompts/infographics/hexagrams/61-中孚卦/' },
            { text: '小过卦（䷽）', link: '/prompts/infographics/hexagrams/62-小过卦/' },
            { text: '既济卦（䷾）', link: '/prompts/infographics/hexagrams/63-既济卦/' },
            { text: '未济卦（䷿）', link: '/prompts/infographics/hexagrams/64-未济卦/' },
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
        },
        {
          text: '前端工程',
          collapsed: true,
          items: [
            { text: '总览', link: '/prompts/frontend-engineering/' },
            { text: '前端架构图', link: '/prompts/frontend-engineering/01-frontend-architecture' },
            { text: '模块依赖图', link: '/prompts/frontend-engineering/02-module-deps' },
            { text: '交互时序图', link: '/prompts/frontend-engineering/03-sequence-diagram' },
            { text: '数据模型图', link: '/prompts/frontend-engineering/04-data-model' },
            { text: '状态机图', link: '/prompts/frontend-engineering/05-state-machine' },
            { text: '页面路由流转图', link: '/prompts/frontend-engineering/06-route-flow' },
            { text: '权限路由守卫图', link: '/prompts/frontend-engineering/07-auth-guard' },
            { text: '外部依赖图', link: '/prompts/frontend-engineering/08-external-deps' },
            { text: '组件生命周期图', link: '/prompts/frontend-engineering/09-component-lifecycle' },
            { text: '架构图通用皮肤规范', link: '/prompts/frontend-engineering/skin-spec' },
          ]
        }
      ],
      '/articles/': [
        {
          text: '系列一：Agent 设计模式系列',
          collapsed: true,
          items: [
            { text: '文章总览', link: '/articles/' },
            { text: '一、提示链、路由、并行化', link: '/articles/2026-03-01__learn-ai-1/' },
            { text: '二、反思、工具使用、规划', link: '/articles/2026-03-02__learn-ai-2/' },
            { text: '三、多智能体、记忆管理与学习适应', link: '/articles/2026-03-08__learn-ai-3/' },
            { text: '四、MCP：给 AI 工具世界造一个 USB 接口', link: '/articles/2026-03-12__learn-ai-4/' },
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
            { text: '十五、从零推导 Agent 工作机制', link: '/articles/2026-04-12__learn-ai-15/' },
          ]
        },
        {
          text: '系列二：AI Agent 全栈学习系列',
          collapsed: true,
          items: [
            { text: '十六、从一份 Vue 简历到全栈 AI Monorepo 的重构之路', link: '/articles/2026-04-20__pre-prj-1/' },
            { text: '十七、前端转全栈需了解的 Docker + CI/CD 核心知识', link: '/articles/2026-04-27__pre-prj-2/' },
            { text: '十八、my-resume 上线实录：从踩坑到方法论', link: '/articles/2026-04-29__pre-prj-3/' },
            { text: '十九、Prompt Template 周报生成——NestJS + LangChain 搭建第一个 AI Demo', link: '/articles/2026-05-01__prompt-template-report/' },
            { text: '二十、数据库技术栈全景——7 种数据库一句话定位与选型决策', link: '/articles/2026-05-08__db-tech-stack/' },
            { text: '二十一、数据库核心概念深入——索引、事务、锁、范式', link: '/articles/2026-05-09__db-concepts/' },
            { text: '二十二、Prisma ORM 入门——用 TypeScript 的方式管理数据库', link: '/articles/2026-05-16__prisma-guide/' },
            { text: '二十三、Card Learning Demo——全栈数据库学习项目的设计与实现', link: '/articles/2026-05-19__card-demo/' },
            { text: '二十四、LangGraph 学习路径·上：从零到图 — 声明式编排的三原语', link: '/articles/2026-05-24__langgraph_1/' },
            { text: '二十五、LangGraph 学习路径·中：记忆与暂停 — 让图成为有状态服务', link: '/articles/2026-05-27__langgraph_2/' },
            { text: '二十六、LangGraph 学习路径·下：Agent 与多智能体 — 从工具调用到调度员模式', link: '/articles/2026-05-30__langgraph_3/' },
            { text: '二十七、从查询扩展崩溃到混合检索跑通 — RAG 系统踩坑与修复实录', link: '/articles/2026-06-01__es-rerank_4/' },
            { text: '二十八、ElasticSearch 基础 — 倒排索引、IK 分词、BM25 一次搞懂', link: '/articles/2026-06-06__es_1/' },
            { text: '二十九、ElasticSearch 实战 — 建索引、CRUD、混合检索一条龙', link: '/articles/2026-06-08__es_2/' },
            { text: '三十、混合检索 RAG — 多路召回 + Rerank 重排 + Agentic RAG 一次搞懂', link: '/articles/2026-06-10__agentic-rag_3/' },
          ]
        }
      ],
      '/': [
        {
          text: 'AI学习记录',
          collapsed: true,
          items: [
            { text: 'AGENTS 总览', link: '/agents/' },
            { text: 'AI 概念地图', link: '/agents/concept-map/' },
            { text: '概念地图维护说明', link: '/agents/concept-map/maintain' },
            { text: '大模型基础', link: '/agents/foundation/' },
            { text: '提示词工程', link: '/agents/prompt-engineering/' },
            {
              text: 'Agent开发',
              collapsed: true,
              items: [
                { text: '总览', link: '/agents/agent-development/' },
                { text: '01 从 Prompt 到 Tool', link: '/agents/agent-development/01-prompt-to-tool' },
                { text: '02 Agent 记忆系统', link: '/agents/agent-development/02-agent-memory' },
                { text: '03 RAG 与 Milvus', link: '/agents/agent-development/03-rag-milvus' },
                { text: '04 简历 RAG 七次迭代', link: '/agents/agent-development/04-resume-rag-iterations' },
                { text: '05 LCEL 链式组装', link: '/agents/agent-development/05-lcel-runnable' },
                { text: '06 NestJS 集成', link: '/agents/agent-development/06-nestjs-langchain' },
                { text: '07 LangGraph 热身：从图开始', link: '/agents/agent-development/07-langgraph-warmup' },
                { text: '08 LangGraph 从图到代码', link: '/agents/agent-development/08-langgraph-code' },
                { text: '09 LangGraph interrupt 暂停', link: '/agents/agent-development/09-langgraph-interrupt' },
                { text: '10 LangGraph prebuilt Agent', link: '/agents/agent-development/10-langgraph-prebuilt-agent' },
                { text: '11 LangGraph Multi-Agent', link: '/agents/agent-development/11-langgraph-multi-agent' },
                { text: '12 LangGraph 架构对比与实战', link: '/agents/agent-development/12-langgraph-architecture-compare' },
                { text: '13 TTS 与 ASR 语音交互', link: '/agents/agent-development/13-tts-stt' },
                { text: '14 AGUI 协议流式组件渲染', link: '/agents/agent-development/14-agui' },
                { text: '15 Docker Compose 部署', link: '/agents/agent-development/15-docker-deploy' },
                { text: '16 ElasticSearch 全文检索', link: '/agents/agent-development/16-es-fulltext' },
                { text: '17 Neo4j 知识图谱 + GraphRAG', link: '/agents/agent-development/17-neo4j-graphrag' },
                { text: '18 LangChain 第一阶段总结', link: '/agents/agent-development/18-langchain-summary' },
              ]
            },
            { text: '多模态应用', link: '/agents/multimodal/' },
            { text: '项目实战', link: '/agents/projects/' },
            { text: '学习资源', link: '/agents/resources/' }
          ]
        },
        {
          text: '全栈开发',
          collapsed: true,
          items: [
            {
              text: '数据库',
              collapsed: true,
              items: [
                { text: '数据库总览与选型', link: '/agents/fullstack/database/' },
                { text: '数据库核心概念', link: '/agents/fullstack/' },
                { text: 'MySQL', link: '/agents/fullstack/database/mysql' },
                { text: 'PostgreSQL', link: '/agents/fullstack/database/postgresql' },
                { text: 'SQLite', link: '/agents/fullstack/database/sqlite-basics' },
                { text: 'MongoDB', link: '/agents/fullstack/database/mongodb' },
                { text: 'Redis', link: '/agents/fullstack/database/redis' },
                { text: 'Elasticsearch', link: '/agents/fullstack/database/elasticsearch' },
                { text: 'Milvus', link: '/agents/fullstack/database/milvus-basics' },
                { text: 'Neo4j', link: '/agents/fullstack/database/neo4j' },
                { text: 'IndexedDB', link: '/agents/fullstack/database/indexeddb' },
              ]
            },
            {
              text: '运维',
              collapsed: true,
              items: [
                { text: 'Docker', link: '/agents/fullstack/devops/docker' },
                { text: 'Nginx', link: '/agents/fullstack/devops/nginx' },
              ]
            },
            {
              text: '后端',
              collapsed: true,
              items: [
                { text: 'NestJS', link: '/agents/fullstack/backend/nestjs' },
              ]
            },
          ]
        },
        {
          text: '科普释义',
          collapsed: true,
          items: [
            { text: '总览', link: '/agents/glossary/' },
            { text: '倒排索引', link: '/agents/glossary/inverted-index' },
            { text: 'IK 分词器', link: '/agents/glossary/ik-analyzer' },
            { text: 'BM25', link: '/agents/glossary/bm25' },
            { text: '向量数据库', link: '/agents/glossary/vector-database' },
            { text: 'Embedding', link: '/agents/glossary/embedding' },
            { text: 'HNSW', link: '/agents/glossary/hnsw' },
            { text: 'Rerank', link: '/agents/glossary/rerank' },
            { text: '混合检索', link: '/agents/glossary/hybrid-search' },
            { text: 'GraphRAG', link: '/agents/glossary/graphrag' },
            { text: 'Agentic RAG', link: '/agents/glossary/agentic-rag' },
            { text: 'ReAct', link: '/agents/glossary/react' },
            { text: 'MCP', link: '/agents/glossary/mcp' },
            { text: 'SSE', link: '/agents/glossary/sse' },
            { text: 'Base64', link: '/agents/glossary/base64' },
            { text: 'ORM', link: '/agents/glossary/orm' },
            { text: 'Monorepo', link: '/agents/glossary/monorepo' },
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
