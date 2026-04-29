<script setup lang="ts">
import { computed } from 'vue'
import type { ConceptGroup, ConceptNode } from '../../data/aiConceptMap'
import { conceptStatusLabels } from '../../data/aiConceptMap'

const props = defineProps<{
  group?: ConceptGroup
  node: ConceptNode
}>()

const docLinks = computed(() =>
  props.node.docs.map((doc) => ({
    ...doc,
    external: doc.href.startsWith('http')
  }))
)

const exampleLinks = computed(() =>
  props.node.examples.map((example) => ({
    ...example,
    external: example.href.startsWith('http')
  }))
)
</script>

<template>
  <aside class="concept-detail" :style="{ '--detail-color': group?.color }">
    <div class="concept-detail__header">
      <span class="concept-detail__group">{{ group?.label }}</span>
      <span class="concept-detail__status">{{ conceptStatusLabels[node.status] }}</span>
    </div>

    <h2 class="concept-detail__title">{{ node.label }}</h2>
    <p class="concept-detail__summary">{{ node.summary }}</p>

    <section class="concept-detail__section">
      <h3 class="concept-detail__section-title">自测问题</h3>
      <p class="concept-detail__question">{{ node.keyQuestion }}</p>
    </section>

    <section class="concept-detail__section">
      <h3 class="concept-detail__section-title">最小改动实验</h3>
      <ul class="concept-detail__list">
        <li v-for="experiment in node.experiments" :key="experiment">{{ experiment }}</li>
      </ul>
    </section>

    <section class="concept-detail__section">
      <h3 class="concept-detail__section-title">关联代码 / 记录</h3>
      <ul class="concept-detail__list">
        <li v-for="example in exampleLinks" :key="example.href">
          <a
            :href="example.href"
            :target="example.external ? '_blank' : undefined"
            :rel="example.external ? 'noreferrer' : undefined"
          >
            {{ example.label }}
          </a>
        </li>
      </ul>
    </section>

    <div class="concept-detail__links">
      <a
        v-for="doc in docLinks"
        :key="doc.href"
        :href="doc.href"
        :target="doc.external ? '_blank' : undefined"
        :rel="doc.external ? 'noreferrer' : undefined"
      >
        {{ doc.label }}
      </a>
    </div>
  </aside>
</template>

<style scoped>
.concept-detail {
  --detail-color: var(--vp-c-brand-1);
  position: sticky;
  top: 88px;
  padding: 22px;
  border: 1px solid color-mix(in srgb, var(--detail-color) 32%, var(--vp-c-divider));
  border-radius: 8px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--detail-color) 7%, var(--vp-c-bg)), var(--vp-c-bg));
}

.concept-detail__header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.concept-detail__group,
.concept-detail__status {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.concept-detail__group {
  background: color-mix(in srgb, var(--detail-color) 14%, transparent);
  color: var(--detail-color);
}

.concept-detail__status {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.concept-detail__title {
  margin: 16px 0 8px;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: 34px;
  line-height: 1.2;
}

.concept-detail__summary,
.concept-detail__question {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.8;
}

.concept-detail__section {
  margin-top: 20px;
}

.concept-detail__section-title {
  margin: 0 0 8px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.4;
}

.concept-detail__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.concept-detail__list a {
  word-break: break-word;
}

.concept-detail__list a,
.concept-detail__links a {
  text-decoration: none;
}

.concept-detail__list a:hover,
.concept-detail__links a:hover {
  text-decoration: underline;
}

.concept-detail__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}

.concept-detail__links a {
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--detail-color) 26%, var(--vp-c-divider));
  border-radius: 7px;
  color: var(--detail-color);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 1100px) {
  .concept-detail {
    position: static;
  }

  .concept-detail__title {
    font-size: 28px;
  }
}

@media (max-width: 640px) {
  .concept-detail {
    padding: 18px;
  }

  .concept-detail__title {
    font-size: 24px;
  }
}
</style>
