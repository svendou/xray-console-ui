<script setup lang="ts">
import { ref } from 'vue'
import { Play, RotateCw, Square, ArrowUpRight, Layers, Globe2, Zap, Cable, ShieldCheck, Plus, RefreshCw } from 'lucide-vue-next'
import { snapshot, healthy, activeJob, api, run, time, toast } from '../store'
import type { ServiceUpdateResult } from '../types'
import StatusBadge from '../components/StatusBadge.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const confirmation = ref<{ action: string; title: string; message: string; danger?: boolean }>()
const updateResult = ref<ServiceUpdateResult>()
const updateChecking = ref(false)
const mtprotoServicePort = snapshot.value?.services.find(service => service.id === 'mtproto')?.port?.replace('TCP ', '')
const mtprotoPort = ref(Number(mtprotoServicePort) || 53528), mtprotoPublicPort = ref(Number(mtprotoServicePort) || 53528)
const icons = [Layers, Globe2, Zap, Cable, ShieldCheck]
function request(action: string, version = '') {
  const preset = ({
    start: { action, title: '启动全部服务？', message: '启动已经安装的组件，并检查核心、隧道和订阅是否就绪。' },
    status: { action, title: '检查详细状态？', message: '将读取服务、端口、隧道就绪、MTProto 队列和网络诊断信息，并写入任务日志。' },
    restart: { action, title: '重启代理与订阅？', message: '代理连接可能短暂中断；运行中的 Cloudflare 隧道会保留。' },
    stop: { action, title: '停止全部服务？', message: '所有代理与订阅将停止，现有连接会中断。账号、密钥和配置文件将保留。', danger: true },
    'restart-tunnel': { action, title: '重建 Cloudflare 隧道？', message: '临时隧道域名可能变化。完成后请在节点页面重新复制 HTTPS 订阅并导入客户端。' },
    mtproto: { action, title: '安装 / 更新 Telegram 代理？', message: '将下载并安装 MTProto 组件，默认 TCP 端口为 53528；NAT 服务器需配置映射。' },
    'mtproto-restart': { action, title: '单独重启 Telegram 代理？', message: '仅重启 MTProto 和健康监控，不会重启 Xray、Hy2 或 Cloudflare 隧道。' },
    'mtproto-protect': { action, title: '启用 Telegram 连接防护？', message: '为本脚本的 MTProto 端口添加新连接限速规则，不会修改 SSH 和其他端口。' },
    'mtproto-unprotect': { action, title: '移除 Telegram 连接防护？', message: '仅移除本脚本创建的 MTProto 新连接限速规则。' },
    'time-sync': { action, title: '配置自动校时？', message: '按原脚本配置 Chrony；如果宿主机无校时权限，会启用 MTProto 时间容差兼容设置。' },
    'update-xray': { action, title: `更新 Xray${version ? ` 到 ${version}` : ''}？`, message: '将使用原脚本的 latest 版本更新 Xray，并保留现有账号、端口和节点配置。' },
    'update-hy2': { action, title: `更新 Hysteria2${version ? ` 到 ${version}` : ''}？`, message: '将使用原脚本的 latest 版本更新 Hysteria2，并保留现有配置。' },
    'update-cloudflare': { action, title: `更新 Cloudflared${version ? ` 到 ${version}` : ''}？`, message: '将使用原脚本的 latest 版本更新 Cloudflared，并保留现有隧道配置。' },
    export: { action, title: '更新订阅？', message: '将重新读取当前隧道和节点配置，生成最新的订阅文件与节点链接。' },
  } as Record<string, { action: string; title: string; message: string; danger?: boolean }>)[action]
  confirmation.value = preset
}
async function execute() { const action = confirmation.value!.action; confirmation.value = undefined; await run(action, action === 'mtproto' ? { mtprotoPort: mtprotoPort.value, mtprotoPublicPort: mtprotoPublicPort.value } : {}) }
async function checkUpdates() {
  if (updateChecking.value) return
  updateChecking.value = true
  try {
    updateResult.value = await api<ServiceUpdateResult>('/service-updates')
    toast('服务版本检查完成。')
  } catch (error) { toast((error as Error).message) }
  finally { updateChecking.value = false }
}
function updateInfo(id: string) { return updateResult.value?.services[id] }
function updateLabel(id: string) {
  const info = updateInfo(id)
  if (!info) return '检查更新'
  if (info.available && info.latest) return `更新 ${info.latest}`
  return info.latest ? '已是最新' : '暂不可用'
}
</script>
<template>
  <div class="page"><div class="page-heading"><div><h1>服务管理</h1><p>统一管理你的连接组件，查看每个服务的实际运行状态。</p></div><RouterLink to="/install" class="button primary"><Plus :size="17" />安装 / 更新</RouterLink></div>
    <section class="control-strip"><div><span class="status-dot" :class="healthy ? 'green' : 'amber'" /><strong>{{ healthy }} 个服务运行中</strong><span>服务状态每 3 秒自动检查</span></div><div class="heading-actions"><button class="button secondary" :disabled="!!activeJob || !snapshot?.installed" @click="request('status')">详细状态</button><button class="button secondary" :disabled="updateChecking || !snapshot?.installed" @click="checkUpdates"><RefreshCw :size="15" :class="{ spin: updateChecking }" />{{ updateChecking ? '检查中…' : '检查更新' }}</button><button class="button secondary" :disabled="!!activeJob || !snapshot?.installed" @click="request('start')"><Play :size="15" />全部启动</button><button class="button secondary" :disabled="!!activeJob || !snapshot?.installed" @click="request('restart')"><RotateCw :size="15" />重启</button><button class="button danger-ghost" :disabled="!!activeJob || !snapshot?.installed" @click="request('stop')"><Square :size="14" />全部停止</button></div></section>
    <p class="service-update-note">{{ updateResult ? `上次检查 ${time(updateResult.checkedAt)} · 更新按钮仅在发现新版本时可用` : '点击“检查更新”获取 Xray 和 Hysteria2 的最新版本。' }}</p>
    <section class="panel service-table"><div class="service-table-head"><span>服务 / 协议</span><span>运行状态</span><span>版本 / 端口</span><span>操作</span></div><div v-for="(service, index) in snapshot?.services" :key="service.id" class="service-table-row"><div class="service-name-cell"><span class="service-icon" :class="service.id"><component :is="icons[index]" :size="21" /></span><div><h2>{{ service.name }}</h2><p>{{ service.description }}</p></div></div><StatusBadge :state="service.state" /><div class="service-version"><strong class="mono">{{ service.version }}</strong><span class="mono">{{ service.port }}</span></div><div v-if="service.id === 'cloudflare'" class="service-update-actions"><button class="button small secondary" :disabled="!!activeJob || service.state === 'missing' || !updateInfo('cloudflare')?.available" @click="request('update-cloudflare', updateInfo('cloudflare')?.latest || '')">{{ updateLabel('cloudflare') }}</button><button class="button small secondary" :disabled="!!activeJob || service.state === 'missing'" @click="request('restart-tunnel')">重建隧道</button></div><div v-else-if="service.id === 'xray'" class="service-update-actions"><button class="button small secondary" :disabled="!!activeJob || service.state === 'missing' || !updateInfo('xray')?.available" @click="request('update-xray', updateInfo('xray')?.latest || '')">{{ updateLabel('xray') }}</button><RouterLink to="/logs?tab=service" class="text-link">查看日志<ArrowUpRight :size="14" /></RouterLink></div><div v-else-if="service.id === 'hy2'" class="service-update-actions"><button class="button small secondary" :disabled="!!activeJob || service.state === 'missing' || !updateInfo('hy2')?.available" @click="request('update-hy2', updateInfo('hy2')?.latest || '')">{{ updateLabel('hy2') }}</button><RouterLink to="/logs?tab=service" class="text-link">查看日志<ArrowUpRight :size="14" /></RouterLink></div><div v-else-if="service.id === 'subscription'" class="service-update-actions"><button class="button small secondary" :disabled="!!activeJob || service.state === 'missing'" @click="request('export')">更新订阅</button><RouterLink to="/logs?tab=service" class="text-link">查看日志<ArrowUpRight :size="14" /></RouterLink></div><div v-else-if="service.id === 'mtproto'" class="service-action-row"><label class="service-port-field">内部<input v-model.number="mtprotoPort" type="number" min="1024" max="65535" /></label><label class="service-port-field">公网<input v-model.number="mtprotoPublicPort" type="number" min="1024" max="65535" /></label><button class="button small secondary" :disabled="!!activeJob || !snapshot?.installed" @click="request('mtproto')">{{ service.state === 'missing' ? '安装代理' : '更新代理' }}</button><button v-if="service.state !== 'missing'" class="button small secondary" :disabled="!!activeJob" @click="request('mtproto-restart')">重启 TG</button></div><RouterLink v-else to="/logs?tab=service" class="text-link">查看日志<ArrowUpRight :size="14" /></RouterLink></div></section>
    <div class="service-bottom-grid"><section class="panel explanatory-panel"><ShieldCheck :size="24" /><div><h2>Telegram 连接防护</h2><p>限制 MTProto 端口的新建连接速率，规则随服务启动自动恢复。请先安装 Telegram 代理。</p><div class="service-action-row"><button class="button secondary small" :disabled="!!activeJob || snapshot?.services.find(s => s.id === 'mtproto')?.state === 'missing'" @click="request('mtproto-protect')">安装 / 更新防护<ArrowUpRight :size="14" /></button><button class="button secondary small" :disabled="!!activeJob || snapshot?.services.find(s => s.id === 'mtproto')?.state === 'missing'" @click="request('mtproto-unprotect')">移除防护</button><button class="button secondary small" :disabled="!!activeJob" @click="request('time-sync')">配置自动校时</button></div></div></section></div>
    <ConfirmDialog :open="!!confirmation" :title="confirmation?.title || ''" :message="confirmation?.message || ''" :danger="confirmation?.danger" @close="confirmation = undefined" @confirm="execute" />
  </div>
</template>

