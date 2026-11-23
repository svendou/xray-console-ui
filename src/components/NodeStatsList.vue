<script setup lang="ts">
import { ref } from 'vue'
import { Activity, Gauge, Globe2, RefreshCw, Server, Timer } from 'lucide-vue-next'
import { snapshot, carrierLatencyByNode, measureCarrierLatency } from '../store'
import StatusBadge from './StatusBadge.vue'

const icons: Record<string, string> = { reality: 'xray', cloudflare: 'cloudflare', hy2: 'hy2' }
const testingNodes = ref<Record<string, boolean>>({})
const carrierRows = (nodeId: string) => ['mobile', 'unicom', 'telecom'].map((id, index) => carrierLatencyByNode.value[nodeId]?.find(item => item.id === id) || ({ id, label: ['移动参考线路', '联通参考线路', '电信参考线路'][index], state: 'unconfigured', latencyMs: null, measuredAt: null, source: '点击更新检测' }))
const connectionState = (nodeId: string) => {
  if (testingNodes.value[nodeId] || !carrierLatencyByNode.value[nodeId]) return '检测中'
  const rows = carrierRows(nodeId)
  if (!rows.some(item => item.latencyMs != null)) return '暂无探针'
  return rows.some(item => item.state === 'healthy') ? '正常' : '异常'
}
async function testConnection(nodeId: string) {
  if (testingNodes.value[nodeId]) return
  testingNodes.value = { ...testingNodes.value, [nodeId]: true }
  try { await measureCarrierLatency(nodeId) } finally { testingNodes.value = { ...testingNodes.value, [nodeId]: false } }
}
</script>
<template>
  <section class="panel node-stats-panel" aria-labelledby="node-stats-title">
    <div class="panel-title node-stats-heading"><div><h2 id="node-stats-title">节点状态</h2><p>每个节点独立显示服务状态和监听地址。</p></div><span class="node-stat-note"><Activity :size="14" />状态每 3 秒更新</span></div>
    <div class="node-card-grid">
      <article v-for="node in snapshot?.nodeStats" :key="node.id" class="node-stat-row">
        <div class="node-stat-top"><div class="node-stat-identity"><span class="service-icon" :class="icons[node.id]"><Globe2 :size="19" /></span><div><strong>{{ node.name }}</strong><small>{{ node.protocol }}</small></div></div><StatusBadge :state="node.state" /></div>
        <div class="node-stat-endpoint mono">{{ node.endpoint }}</div>
        <div class="node-card-metrics"><div><span>协议</span><strong><Server :size="14" />{{ node.protocol.split(' / ')[0] }}</strong></div><div><span>连接状态</span><strong class="connection-value" :class="connectionState(node.id) === '正常' ? 'healthy' : connectionState(node.id) === '异常' ? 'failed' : 'pending'"><Timer :size="14" />{{ connectionState(node.id) }}</strong></div></div>
        <div class="carrier-latencies" aria-label="三网参考延迟"><div class="carrier-latency-head"><span>三网参考线路</span><button class="text-link" :disabled="testingNodes[node.id]" :aria-label="`更新${node.name}的三网参考线路`" @click="testConnection(node.id)"><RefreshCw :size="12" :class="{ spin: testingNodes[node.id] }" />{{ testingNodes[node.id] ? '更新中' : '更新' }}</button></div><div v-for="carrier in carrierRows(node.id)" :key="carrier.id" class="carrier-latency-row"><span class="carrier-mark" :class="carrier.id" /> <span>{{ carrier.label.replace('参考线路', '') }}</span><strong :class="carrier.state">{{ carrier.latencyMs == null ? '暂无探针' : `${carrier.latencyMs} ms` }}</strong></div></div>
      </article>
    </div>
    <div class="node-stats-foot"><Gauge :size="14" /><span>有有效三网参考结果时汇总连接状态，任一线路正常即显示“正常”，全部超时显示“异常”，没有有效公共探针时显示“暂无探针”。</span></div>
  </section>
</template>
