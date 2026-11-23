<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw, Download, Terminal, Clock3, Check, ScrollText, CircleAlert, Radio, ArrowDown } from 'lucide-vue-next'
import { snapshot, api, time, toast } from '../store'
import StatusBadge from '../components/StatusBadge.vue'
const route = useRoute()
const tab = ref(route.query.tab === 'service' ? 'service' : 'tasks'), selectedId = ref(''), serviceLines = ref<string[]>([]), search = ref(''), follow = ref(true), loading = ref(false), failed = ref('')
const terminal = ref<HTMLElement>()
const selected = computed(() => snapshot.value?.jobs.find(j => j.id === selectedId.value) || snapshot.value?.jobs[0])
const lines = computed(() => (tab.value === 'tasks' ? selected.value?.logs || [] : serviceLines.value).filter(line => line.toLowerCase().includes(search.value.toLowerCase())))
async function refresh() {
  if (loading.value) return
  loading.value = true
  try { serviceLines.value = (await api<{ lines: string[] }>('/logs')).lines; failed.value = '' } catch (e) { failed.value = (e as Error).message }
  finally { loading.value = false }
}
let interval: ReturnType<typeof setInterval>
onMounted(() => { if (tab.value === 'service') refresh(); interval = setInterval(() => { if (tab.value === 'service' && !document.hidden && follow.value) refresh() }, 5000) })
onUnmounted(() => clearInterval(interval))
watch(tab, value => { search.value = ''; if (value === 'service') refresh() })
watch(() => lines.value.length, async () => { if (follow.value) { await nextTick(); terminal.value?.scrollTo({ top: terminal.value.scrollHeight }) } })
function download() {
  if (!lines.value.length) { toast('暂无可导出的日志。'); return }
  const blob = new Blob([lines.value.join('\n')], { type: 'text/plain;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = `xray-${tab.value}-${Date.now()}.log`; a.click(); URL.revokeObjectURL(url)
}
</script>
<template>
  <div class="page"><div class="page-heading"><div><h1>任务与日志</h1><p>每次操作都有记录。刷新或关闭页面，不会取消后台任务。</p></div><button class="button secondary" @click="download"><Download :size="16" />导出当前日志</button></div>
    <div class="log-tabs"><button :class="{ selected: tab === 'tasks' }" :aria-pressed="tab === 'tasks'" @click="tab = 'tasks'"><Terminal :size="17" />部署任务<span class="count-label">{{ snapshot?.jobs.length }}</span></button><button :class="{ selected: tab === 'service' }" :aria-pressed="tab === 'service'" @click="tab = 'service'"><ScrollText :size="17" />服务日志</button></div>
    <div class="logs-layout" :class="{ 'service-only': tab === 'service' }"><aside v-if="tab === 'tasks'" class="panel task-list"><div class="task-list-heading">任务记录<span>最近 30 条</span></div><button v-for="job in snapshot?.jobs" :key="job.id" class="task-list-item" :class="{ selected: selected?.id === job.id }" @click="selectedId = job.id"><div><component :is="job.state === 'running' ? RefreshCw : job.state === 'succeeded' ? Check : CircleAlert" :size="16" :class="{ spin: job.state === 'running', 'good-text': job.state === 'succeeded', 'warn-text': ['failed', 'interrupted'].includes(job.state) }" /><strong>{{ job.label }}</strong></div><span>{{ new Date(job.startedAt).toLocaleDateString('zh-CN') }} · {{ time(job.startedAt) }}</span><StatusBadge :state="job.state" /></button><div v-if="!snapshot?.jobs.length" class="inline-empty">暂无任务记录</div></aside>
      <section class="panel log-viewer"><div class="panel-title"><div><h2>{{ tab === 'tasks' ? selected?.label || '任务输出' : '服务运行日志' }}</h2><p v-if="tab === 'tasks' && selected"><Clock3 :size="13" />开始于 {{ time(selected.startedAt) }}<span v-if="selected.exitCode !== undefined"> · 退出码 {{ selected.exitCode }}</span></p><p v-else>最近 150 行 · 自动刷新间隔 5 秒</p></div><StatusBadge v-if="tab === 'tasks' && selected" :state="selected.state" /><button v-if="tab === 'service'" class="icon-button" aria-label="刷新服务日志" :disabled="loading" @click="refresh"><RefreshCw :size="17" :class="{ spin: loading }" /></button></div>
        <div class="terminal-toolbar"><input v-model="search" type="search" aria-label="筛选日志内容" placeholder="筛选日志内容…" /><label><input v-model="follow" type="checkbox" />{{ tab === 'tasks' ? '跟随输出' : '自动刷新' }}</label><span>{{ lines.length }} 行</span></div><p v-if="failed" class="field-error" role="alert">{{ failed }}</p><div ref="terminal" class="terminal-output" tabindex="0" aria-label="日志输出"><div v-for="(line, index) in lines" :key="index" class="log-line" :class="{ 'error-line': /ERROR|failed|失败|错误/i.test(line), 'success-line': /通过|完成|ready|started/i.test(line) }"><span class="line-number" aria-hidden="true">{{ index + 1 }}</span><code>{{ line }}</code></div><div v-if="!lines.length" class="terminal-empty"><Terminal :size="26" /><span>{{ search ? '没有匹配的日志，试试其他关键词。' : '暂无日志，执行任务后会在这里显示输出。' }}</span></div></div><div class="terminal-footer"><span><Radio :size="13" />{{ tab === 'tasks' && selected?.state === 'running' ? '正在接收任务输出' : '日志已加载' }}</span><span>任务保留最后 500 行 <span class="footer-dot">·</span> 密钥可能出现在日志中</span></div>
      </section></div>
    <div class="overview-note"><CircleAlert :size="15" />后台重启会将未完成任务标记为“已中断”。请检查实际服务状态后再决定是否重试。</div>
  </div>
</template>
