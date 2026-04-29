<script setup lang="ts">
import { computed } from 'vue'
import type { ConceptGroup, ConceptLink, ConceptNode } from '../../data/aiConceptMap'
import { conceptStatusLabels } from '../../data/aiConceptMap'

const props = defineProps<{
  groups: ConceptGroup[]
  links: ConceptLink[]
  nodes: ConceptNode[]
  selectedNodeId: string
}>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

const nodesById = computed(() => new Map(props.nodes.map((node) => [node.id, node])))
const groupsById = computed(() => new Map(props.groups.map((group) => [group.id, group])))

const visibleLinks = computed(() =>
  props.links
    .map((link) => ({
      ...link,
      sourceNode: nodesById.value.get(link.source),
      targetNode: nodesById.value.get(link.target)
    }))
    .filter((link) => link.sourceNode && link.targetNode)
)

const selectedNode = computed(() => nodesById.value.get(props.selectedNodeId))

function linkPath(source: ConceptNode, target: ConceptNode) {
  const bend = Math.max(8, Math.abs(target.x - source.x) * 0.34)
  const controlX1 = source.x + bend
  const controlY1 = source.y
  const controlX2 = target.x - bend
  const controlY2 = target.y

  return `M ${source.x} ${source.y} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${target.x} ${target.y}`
}
</script>

<template>
  <div class="concept-board" aria-label="AI 学习概念地图">
    <svg class="concept-board__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker
          id="concept-arrow"
          markerHeight="4"
          markerUnits="strokeWidth"
          markerWidth="4"
          orient="auto"
          refX="3"
          refY="2"
          viewBox="0 0 4 4"
        >
          <path d="M 0 0 L 4 2 L 0 4 z" />
        </marker>
      </defs>
      <g v-for="link in visibleLinks" :key="`${link.source}-${link.target}`">
        <path
          class="concept-board__path"
          :class="{
            'concept-board__path--active':
              selectedNodeId === link.source || selectedNodeId === link.target
          }"
          :d="linkPath(link.sourceNode!, link.targetNode!)"
        />
      </g>
    </svg>

    <button
      v-for="node in nodes"
      :key="node.id"
      class="concept-node"
      :class="[
        `concept-node--${node.status}`,
        { 'concept-node--selected': selectedNodeId === node.id }
      ]"
      :style="{
        left: `${node.x}%`,
        top: `${node.y}%`,
        '--node-color': groupsById.get(node.groupId)?.color
      }"
      type="button"
      @click="emit('select', node.id)"
    >
      <span class="concept-node__status">{{ conceptStatusLabels[node.status] }}</span>
      <strong class="concept-node__label">{{ node.label }}</strong>
      <span class="concept-node__subtitle">{{ node.subtitle }}</span>
    </button>

    <div
      v-if="selectedNode"
      class="concept-board__pulse"
      :style="{ left: `${selectedNode.x}%`, top: `${selectedNode.y}%` }"
    />
  </div>
</template>

<style scoped>
.concept-board {
  position: relative;
  min-height: 820px;
  overflow: hidden;
  border: 1px solid rgba(61, 68, 77, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(73, 88, 100, 0.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(73, 88, 100, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 8% 18%, rgba(47, 111, 115, 0.12), transparent 28%),
    radial-gradient(circle at 86% 84%, rgba(154, 91, 40, 0.12), transparent 30%),
    var(--vp-c-bg-soft);
  background-size: 48px 48px, 48px 48px, auto, auto, auto;
}

.concept-board__links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.concept-board__path {
  fill: none;
  marker-end: url("#concept-arrow");
  stroke: rgba(90, 97, 108, 0.34);
  stroke-linecap: round;
  stroke-width: 0.32;
  transition: stroke 0.2s ease, stroke-width 0.2s ease;
  vector-effect: non-scaling-stroke;
}

.concept-board__path--active {
  stroke: var(--vp-c-brand-1);
  stroke-width: 0.64;
}

.concept-node {
  --node-color: var(--vp-c-brand-1);
  position: absolute;
  z-index: 2;
  width: clamp(150px, 12vw, 194px);
  min-height: 96px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--node-color) 46%, var(--vp-c-divider));
  border-radius: 8px;
  background: color-mix(in srgb, var(--vp-c-bg) 88%, var(--node-color));
  box-shadow: 0 12px 30px rgba(21, 31, 40, 0.08);
  color: var(--vp-c-text-1);
  cursor: pointer;
  text-align: left;
  transform: translate(-50%, -50%);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.concept-node:hover,
.concept-node:focus-visible,
.concept-node--selected {
  border-color: var(--node-color);
  box-shadow: 0 18px 42px rgba(21, 31, 40, 0.16);
  outline: none;
  transform: translate(-50%, -52%);
}

.concept-node--next {
  border-style: dashed;
}

.concept-node--later {
  opacity: 0.78;
}

.concept-node__status {
  display: inline-flex;
  margin-bottom: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--node-color) 12%, transparent);
  color: var(--node-color);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
}

.concept-node__label,
.concept-node__subtitle {
  display: block;
}

.concept-node__label {
  font-size: 16px;
  line-height: 1.3;
}

.concept-node__subtitle {
  margin-top: 4px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.45;
}

.concept-board__pulse {
  position: absolute;
  z-index: 1;
  width: 210px;
  height: 210px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(66, 133, 138, 0.2), transparent 68%);
  pointer-events: none;
  transform: translate(-50%, -50%);
}

@media (max-width: 1280px) {
  .concept-board {
    min-height: 760px;
  }

  .concept-node {
    width: clamp(138px, 18vw, 176px);
  }
}

@media (max-width: 900px) {
  .concept-board {
    display: grid;
    min-height: auto;
    gap: 12px;
    padding: 12px;
    background: var(--vp-c-bg-soft);
  }

  .concept-board__links,
  .concept-board__pulse {
    display: none;
  }

  .concept-node {
    position: static;
    width: 100%;
    min-height: auto;
    transform: none;
  }

  .concept-node:hover,
  .concept-node:focus-visible,
  .concept-node--selected {
    transform: none;
  }
}
</style>
