<script setup lang="ts">
import { withBase } from 'vitepress'
import { computed, shallowRef } from 'vue'
import {
  conceptGroups,
  conceptLinks,
  conceptNodes,
  conceptStatusLabels,
  type ConceptStatus
} from '../../data/aiConceptMap'
import ConceptMapBoard from './ConceptMapBoard.vue'
import ConceptMapDetail from './ConceptMapDetail.vue'

const selectedGroupId = shallowRef('all')
const selectedStatus = shallowRef<ConceptStatus | 'all'>('all')
const selectedNodeId = shallowRef('agent-loop')

const groupOptions = computed(() => [
  { id: 'all', label: '全部' },
  ...conceptGroups.map((group) => ({ id: group.id, label: group.label }))
])

const statusOptions = computed(() => [
  { id: 'all' as const, label: '全部状态' },
  ...Object.entries(conceptStatusLabels).map(([id, label]) => ({
    id: id as ConceptStatus,
    label
  }))
])

const visibleNodes = computed(() =>
  conceptNodes.filter((node) => {
    const matchesGroup = selectedGroupId.value === 'all' || node.groupId === selectedGroupId.value
    const matchesStatus = selectedStatus.value === 'all' || node.status === selectedStatus.value
    return matchesGroup && matchesStatus
  })
)

const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((node) => node.id)))

const visibleLinks = computed(() =>
  conceptLinks.filter((link) => visibleNodeIds.value.has(link.source) && visibleNodeIds.value.has(link.target))
)

const selectedNode = computed(() => {
  const visibleSelected = visibleNodes.value.find((node) => node.id === selectedNodeId.value)
  return visibleSelected ?? visibleNodes.value[0] ?? conceptNodes[0]
})

const selectedGroup = computed(() =>
  conceptGroups.find((group) => group.id === selectedNode.value.groupId)
)

const progressItems = computed(() =>
  Object.entries(conceptStatusLabels).map(([status, label]) => ({
    status,
    label,
    count: conceptNodes.filter((node) => node.status === status).length
  }))
)

const maintainLink = withBase('/zh/agents/concept-map/maintain')

function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId
}
</script>

<template>
  <section class="ai-map">
    <div class="ai-map__hero">
      <div>
        <p class="ai-map__eyebrow">Personal AI Knowledge Map</p>
        <h1 class="ai-map__title">把碎片概念连成一张可继续生长的图</h1>
        <p class="ai-map__intro">
          这张图从你已经沉淀的 AI 基础、RAG、Memory、Tool Calling 出发，连接到下一步的
          LangGraph、Structured Output 和 Evaluation。后续新增概念时，只需要维护数据节点和关系。
        </p>
      </div>

      <div class="ai-map__progress" aria-label="学习状态统计">
        <div v-for="item in progressItems" :key="item.status" class="ai-map__progress-item">
          <strong>{{ item.count }}</strong>
          <span>{{ item.label }}</span>
        </div>
      </div>
    </div>

    <div class="ai-map__filters" aria-label="概念地图筛选">
      <div class="ai-map__filter-group">
        <span class="ai-map__filter-label">领域</span>
        <button
          v-for="group in groupOptions"
          :key="group.id"
          class="ai-map__filter-button"
          :class="{ 'ai-map__filter-button--active': selectedGroupId === group.id }"
          type="button"
          @click="selectedGroupId = group.id"
        >
          {{ group.label }}
        </button>
      </div>

      <div class="ai-map__filter-group">
        <span class="ai-map__filter-label">状态</span>
        <button
          v-for="status in statusOptions"
          :key="status.id"
          class="ai-map__filter-button"
          :class="{ 'ai-map__filter-button--active': selectedStatus === status.id }"
          type="button"
          @click="selectedStatus = status.id"
        >
          {{ status.label }}
        </button>
      </div>
    </div>

    <div class="ai-map__content">
      <ConceptMapBoard
        :groups="conceptGroups"
        :links="visibleLinks"
        :nodes="visibleNodes"
        :selected-node-id="selectedNode.id"
        @select="selectNode"
      />
      <ConceptMapDetail :group="selectedGroup" :node="selectedNode" />
    </div>

    <div class="ai-map__method">
      <section>
        <h2>维护方式</h2>
        <p>
          新增概念时，在 <code>docs/.vitepress/data/aiConceptMap.ts</code> 里追加一个
          <code>conceptNodes</code> 节点，再用 <code>conceptLinks</code> 描述它和已有概念的关系。
        </p>
        <a class="ai-map__method-link" :href="maintainLink">
          查看维护说明
        </a>
      </section>
      <section>
        <h2>学习标准</h2>
        <p>
          每个节点都保留一句话解释、自测问题、最小改动实验和关联代码。它不是静态目录，而是“能讲出来、能改出因果关系”的学习仪表盘。
        </p>
      </section>
      <section>
        <h2>迭代规则</h2>
        <p>
          先在 <code>drafts/&lt;category&gt;/</code> 写运行和排查记录，再把成熟概念迁入地图；最后把能公开输出的内容整理进正式文档。
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.ai-map {
  width: min(100%, 1480px);
  margin: 0 auto;
  padding: 44px 32px 56px;
}

.ai-map__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 360px);
  gap: 36px;
  align-items: end;
  margin-bottom: 28px;
}

.ai-map__eyebrow {
  margin: 0 0 10px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ai-map__title {
  max-width: 980px;
  margin: 0;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: clamp(38px, 5vw, 76px);
  line-height: 1.04;
}

.ai-map__intro {
  max-width: 920px;
  margin: 18px 0 0;
  color: var(--vp-c-text-2);
  font-size: 17px;
  line-height: 1.9;
}

.ai-map__progress {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ai-map__progress-item {
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.ai-map__progress-item strong,
.ai-map__progress-item span {
  display: block;
}

.ai-map__progress-item strong {
  color: var(--vp-c-text-1);
  font-size: 26px;
  line-height: 1;
}

.ai-map__progress-item span {
  margin-top: 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.ai-map__filters {
  display: grid;
  gap: 12px;
  margin-bottom: 22px;
  padding: 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.ai-map__filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.ai-map__filter-label {
  min-width: 40px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 700;
}

.ai-map__filter-button {
  padding: 7px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.ai-map__filter-button:hover,
.ai-map__filter-button:focus-visible,
.ai-map__filter-button--active {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
  outline: none;
}

.ai-map__content {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 390px);
  gap: 22px;
  align-items: start;
}

.ai-map__method {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 22px;
}

.ai-map__method section {
  padding: 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.ai-map__method h2 {
  margin: 0 0 8px;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: 18px;
}

.ai-map__method p {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.8;
}

.ai-map__method-link {
  display: inline-flex;
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 7px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 1280px) {
  .ai-map__content {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 1100px) {
  .ai-map__hero,
  .ai-map__method {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ai-map {
    padding: 28px 16px 40px;
  }

  .ai-map__progress {
    grid-template-columns: 1fr 1fr;
  }

  .ai-map__title {
    font-size: clamp(26px, 9vw, 44px);
  }

  .ai-map__intro {
    font-size: 15px;
    line-height: 1.8;
  }

  .ai-map__filters {
    padding: 14px;
  }
}
</style>
