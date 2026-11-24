<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowUpRight, ArrowRight, Plus, RotateCw, Server, Cpu, MemoryStick, Clock3, Network, Activity, Check, Cable, Globe2, ShieldCheck, Layers, Terminal, RefreshCw, Pause, Download, Upload, Gauge, Timer, Zap } from 'lucide-vue-next'
import { snapshot, healthy, activeJob, duration, run, time, bytes, serverLatency, measureServerLatency } from '../store'
import StatusBadge from '../components/StatusBadge.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import NodeStatsList from '../components/NodeStatsList.vue'
const router = useRouter()
const confirm = ref(false), serverConfirm = ref(false), paused = ref(false), frozen = ref<typeof snapshot.value>(), testing = ref(false)
const data = computed(() => paused.value ? frozen.value : snapshot.value)
const trafficTotal = computed(() => snapshot.value?.traffic
  ? snapshot.value.traffic.totalRx + snapshot.value.traffic.totalTx
  : 0)
const trafficUsed = computed(() => snapshot.value?.traffic
  ? Math.min(100, trafficTotal.value / snapshot.value.traffic.quotaBytes * 100)
  : 0)
const enabled = computed(() => snapshot.value?.services.filter(s => !['missing', 'disabled'].includes(s.state)).length || 0)
const points = (field: 'cpu' | 'memory') => (data.value?.history || []).map((s, i, a) => `${44 + i / Math.max(1, a.length - 1) * 650},${182 - s[field] * 1.5}`).join(' ')
const icons: Record<string, typeof Server> = { xray: Layers, cloudflare: Globe2, hy2: Activity, subscription: Cable, mtproto: ShieldCheck }
function togglePause() { if (!paused.value) frozen.value = JSON.parse(JSON.stringify(snapshot.value)); paused.value = !paused.value }
async function restart() { confirm.value = false; await run('restart') }
async function rebootServer() { serverConfirm.value = false; await run('reboot-server') }
async function testLatency() { if (testing.value) return; testing.value = true; try { await measureServerLatency() } finally { testing.value = false } }
onMounted(() => { if (!serverLatency.value) testLatency() })
</script>
<template>
  <div v-if="snapshot" class="page dashboard-page">
    <div class="page-heading"><div><h1>运行总览<span class="heading-status" :class="healthy === enabled && enabled ? 'good' : 'warn'"><span class="status-dot" />{{ healthy === enabled && enabled ? '服务运行正常' : '服务需要关注' }}</span></h1><p>掌握你的连接状态，让每一次部署都清晰可见。</p></div><div class="heading-actions"><button class="button secondary" :disabled="!!activeJob || !snapshot.installed" @click="confirm = true"><RotateCw :size="16" />重启服务</button><button class="button danger-ghost" :disabled="!!activeJob || !snapshot.installed" @click="serverConfirm = true"><Server :size="16" />重启服务器</button><RouterLink class="button primary" to="/install"><Plus :size="18" />安装 / 更新</RouterLink></div></div>
    <section class="server-strip" aria-label="服务器信息"><span class="server-emblem"><Server :size="25" /></span><div class="server-name"><strong>{{ snapshot.hostname }}</strong><span>{{ snapshot.platform }}</span></div><span class="server-separator" /><div class="server-address"><span>公网地址</span><strong class="mono">{{ snapshot.settings.server || '尚未配置' }}</strong></div><span class="server-separator" /><div class="server-type"><span>部署方式</span><strong>独立服务器 <span class="small-tag">{{ snapshot.demo ? 'DEMO' : 'LOCAL' }}</span></strong></div><RouterLink to="/settings" class="text-link server-details">服务器详情<ArrowUpRight :size="15" /></RouterLink></section>
    <section class="metrics-row" aria-label="服务器资源读数">
      <div class="metric"><div class="metric-label"><Network :size="17" />运行服务</div><div class="metric-number">{{ healthy }}<span>/ {{ enabled }}</span><span class="metric-note good-text"><Check :size="13" />{{ enabled && healthy === enabled ? '全部健康' : '查看服务' }}</span></div><p>已安装服务的本机运行状态</p></div>
      <div class="metric"><div class="metric-label"><Cpu :size="17" />CPU 使用率</div><div class="metric-number">{{ snapshot.cpu }}<span>%</span><span class="metric-note">{{ snapshot.cores }} 核心</span></div><div class="meter"><span :style="{ width: snapshot.cpu + '%' }" /></div></div>
      <div class="metric"><div class="metric-label"><MemoryStick :size="17" />内存使用率</div><div class="metric-number">{{ snapshot.memory }}<span>%</span><span class="metric-note">{{ (snapshot.totalMemory / 1024 ** 3).toFixed(1) }} GB 总量</span></div><div class="meter memory"><span :style="{ width: snapshot.memory + '%' }" /></div></div>
      <div class="metric"><div class="metric-label"><Clock3 :size="17" />服务器运行时间</div><div class="metric-number uptime-number">{{ duration(snapshot.uptime) }}</div><p>自本次系统启动</p></div>
    </section>
    <section class="traffic-grid" aria-label="网络流量与测速">
      <div class="panel traffic-card traffic-quota-card"><div class="traffic-card-head"><div class="metric-label"><Activity :size="17" />流量统计</div><span class="traffic-source"><span class="status-dot green" />{{ snapshot.demo ? '演示数据' : snapshot.traffic.interface }}</span></div><div class="traffic-total traffic-balance"><strong>{{ bytes(trafficTotal) }}</strong><small>/ {{ bytes(snapshot.traffic.quotaBytes) }}</small></div><div class="traffic-caption"><span>累计下行 <strong>{{ bytes(snapshot.traffic.totalRx) }}</strong></span><i /><span>累计上行 <strong>{{ bytes(snapshot.traffic.totalTx) }}</strong></span></div><div class="quota-row"><span>服务器额度 {{ bytes(snapshot.traffic.quotaBytes) }}</span><strong>{{ trafficUsed.toFixed(1) }}% 已使用</strong></div><div class="quota-track"><span :style="{ width: String(trafficUsed) + '%' }" /></div></div>
      <div class="panel traffic-card"><div class="traffic-card-head"><div class="metric-label"><Zap :size="17" />实时网速</div><span class="traffic-source">每 3 秒更新</span></div><div class="traffic-total rate"><span><Download :size="15" />{{ bytes(snapshot.traffic.downRate) }}/s</span><span><Upload :size="15" />{{ bytes(snapshot.traffic.upRate) }}/s</span></div><div class="traffic-caption">峰值 ↓ {{ bytes(snapshot.traffic.peakDown) }}/s <i />峰值 ↑ {{ bytes(snapshot.traffic.peakUp) }}/s</div></div>
      <div class="panel speed-card"><div class="traffic-card-head"><div class="metric-label"><Gauge :size="17" />服务器延迟</div><span class="traffic-source">{{ serverLatency ? time(serverLatency.measuredAt) : '尚未检测' }}</span></div><div v-if="serverLatency && serverLatency.average !== null" class="speed-result"><span><strong>{{ serverLatency.average }}</strong><small>ms 平均</small></span><span><strong>{{ serverLatency.min }}</strong><small>ms 最低</small></span><span><strong>{{ serverLatency.max }}</strong><small>ms 最高</small></span></div><div v-else class="speed-empty"><Timer :size="18" /><span>从当前网络访问面板服务器</span></div><button class="button small secondary speed-button" :disabled="testing" @click="testLatency"><RefreshCw :size="14" :class="{ spin: testing }" />{{ testing ? '检测中…' : '检测当前网络' }}</button></div>
    </section>
    <NodeStatsList />
    <div class="overview-grid">
      <section class="panel resource-panel"><div class="panel-title"><div><h2>资源监测</h2><p>CPU 与内存趋势 · 每 3 秒更新</p></div><button class="button small secondary" :aria-pressed="paused" @click="togglePause"><component :is="paused ? RefreshCw : Pause" :size="13" />{{ paused ? '继续' : '暂停' }}</button></div>
        <div class="chart-legend"><span><i class="legend-dot cpu-color" />CPU <strong>{{ data?.cpu }}%</strong></span><span><i class="legend-dot memory-color" />内存 <strong>{{ data?.memory }}%</strong></span><span v-if="paused" class="paused-label">已暂停显示</span></div>
        <div class="resource-chart"><svg viewBox="0 0 720 220" role="img" :aria-label="`CPU ${data?.cpu}%，内存 ${data?.memory}%，最近 ${data?.history.length} 次采样趋势`"><defs><linearGradient id="cpu-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--blue)" stop-opacity="0.16" /><stop offset="100%" stop-color="var(--blue)" stop-opacity="0" /></linearGradient></defs><g v-for="n in [0, 25, 50, 75, 100]" :key="n"><line x1="44" x2="694" :y1="182 - n * 1.5" :y2="182 - n * 1.5" class="chart-grid" /><text x="27" :y="186 - n * 1.5" text-anchor="end">{{ n }}%</text></g><polygon v-if="data?.history.length" :points="`44,182 ${points('cpu')} 694,182`" fill="url(#cpu-fill)" /><polyline :points="points('memory')" class="chart-line memory-line" /><polyline :points="points('cpu')" class="chart-line cpu-line" /><text x="44" y="212">{{ data?.history.length ? time(data.history[0]!.time) : '等待采样' }}</text><text x="370" y="212" text-anchor="middle">最近 {{ data?.history.length || 0 }} 次采样</text><text x="694" y="212" text-anchor="end">{{ paused ? '暂停时刻' : '现在' }}</text></svg></div>
        <div class="chart-foot"><span class="status-dot green" /><span>{{ snapshot.demo ? '演示数据' : '主机资源采样' }}</span><span>{{ paused ? '显示已暂停，后台继续采样' : '采样窗口最多保留 3 分钟' }}</span></div>
      </section>
      <section class="panel service-overview"><div class="panel-title"><div><h2>服务状态</h2><p>{{ healthy }} 个服务正在为你工作</p></div><RouterLink to="/services" class="icon-button" aria-label="查看全部服务"><ArrowUpRight :size="18" /></RouterLink></div><RouterLink v-for="service in snapshot.services" :key="service.id" to="/services" class="compact-service"><span class="service-icon" :class="service.id"><component :is="icons[service.id]" :size="19" /></span><div><strong>{{ service.name }}</strong><span>{{ service.port }}</span></div><StatusBadge :state="service.state" /></RouterLink></section>
    </div>
    <div class="overview-bottom">
      <section class="panel recent-panel"><div class="panel-title"><h2>最近任务</h2><RouterLink to="/logs" class="text-link">全部任务<ArrowRight :size="14" /></RouterLink></div><RouterLink v-for="job in snapshot.jobs.slice(0, 3)" :key="job.id" to="/logs" class="recent-task"><span class="task-icon"><Terminal :size="18" /></span><div><strong>{{ job.label }}</strong><span>{{ new Date(job.startedAt).toLocaleString('zh-CN', { hour12: false }) }}</span></div><StatusBadge :state="job.state" /></RouterLink><div v-if="!snapshot.jobs.length" class="inline-empty">还没有任务，开始你的第一次部署吧。</div></section>
      <section class="panel subscription-shortcut"><span class="subscription-symbol"><Cable :size="25" /></span><div><h2>让所有设备，保持连接。</h2><p>获取节点链接和专属订阅，轻松接入你的客户端。</p></div><RouterLink to="/nodes" class="text-link">管理节点与订阅<ArrowUpRight :size="16" /></RouterLink></section>
    </div>
    <div class="overview-note"><ShieldCheck :size="15" />流量统计读取 {{ snapshot.traffic.interface }} 网卡总量，包含 SSH、更新等其他流量；实际节点外网可用性请在客户端验证。</div>
    <ConfirmDialog :open="serverConfirm" title="确认重启服务器？" message="服务器会立即重启，面板连接和所有代理连接会中断。重启完成后需要等待服务器和面板服务恢复。" confirm-label="确认重启服务器" :danger="true" @close="serverConfirm = false" @confirm="rebootServer" />
    <ConfirmDialog :open="confirm" title="重启代理与订阅？" message="现有代理连接可能短暂中断。运行中的 Cloudflare 隧道将被保留。" confirm-label="确认重启" @close="confirm = false" @confirm="restart" />
  </div>
</template>
