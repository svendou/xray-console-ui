<script setup lang="ts">
import { ref, computed } from 'vue'
import { Globe2, ShieldCheck, ArrowRight, Terminal, Info, Settings2, Cable, Gauge, RefreshCw, X } from 'lucide-vue-next'
import { snapshot, activeJob, api, run, copy, toast } from '../store'
import type { KernelInfo } from '../types'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const entry = ref(snapshot.value?.settings.cf_entry || 'auto'), confirm = ref(false), uninstallConfirm = ref(false)
const bbrV3ScriptUrl = 'https://github.com/byJoey/Actions-bbr-v3'
const kernelMenu = [
  { id: 'bbr-linux', group: '内核管理', title: 'BBR', detail: '使用 Linux 系统自带的 bbr 拥塞控制', tone: 'blue', action: 'congestion', value: 'bbr' },
  { id: 'bbr-standard', group: '内核管理', title: '安装 BBR V3 标准版', detail: '自动安装最新版，适合日常使用', tone: 'blue', action: 'bbr-profile', value: 'standard' },
  { id: 'bbr-max', group: '内核管理', title: '安装 BBR V3 Max', detail: '自动安装最新版，吞吐优先', tone: 'violet', action: 'bbr-profile', value: 'max' },
  { id: 'remove-kernel', group: '内核管理', title: '卸载 BBR 内核', detail: '移除脚本安装的内核', tone: 'rose', action: 'bbr-menu', value: '9' },
  { id: 'fq', group: '队列调度', title: 'BBR + FQ', detail: '低延迟公平队列', tone: 'teal', action: 'qdisc', value: 'fq' },
  { id: 'fq-codel', group: '队列调度', title: 'BBR + FQ_CODEL', detail: '主动队列管理', tone: 'teal', action: 'qdisc', value: 'fq_codel' },
  { id: 'fq-pie', group: '队列调度', title: 'BBR + FQ_PIE', detail: '按延迟控制队列', tone: 'teal', action: 'qdisc', value: 'fq_pie' },
  { id: 'cake', group: '队列调度', title: 'BBR + CAKE', detail: '整形与公平队列', tone: 'teal', action: 'qdisc', value: 'cake' },
  { id: 'tcp', group: '系统优化', title: '亚太机 TCP 调优', detail: '连接队列与 Fast Open 参数', tone: 'amber', action: 'bbr-menu', value: '8' },
  { id: 'bandwidth', group: '系统优化', title: 'BBR V3 智能优化', detail: '输入线路与真实 RTT 后执行', tone: 'amber', action: 'bbr-smart' },
  { id: 'crazy', group: '系统优化', title: 'BBR V3 疯狂模式', detail: '极限测速挑战，风险更高', tone: 'violet', action: 'bbr-menu', value: '12' },
  { id: 'clear', group: '系统优化', title: '清空网络优化', detail: '移除脚本写入的优化项', tone: 'rose', action: 'bbr-menu', value: '11' },
  { id: 'ipv6-off', group: 'IPv6', title: '禁用 IPv6', detail: '极限测试环境使用', tone: 'rose', action: 'bbr-menu', value: '13' },
  { id: 'ipv6-on', group: 'IPv6', title: '恢复 IPv6', detail: '恢复系统 IPv6 参数', tone: 'slate', action: 'bbr-menu', value: '14' },
]
const kernelGroups = computed(() => ['内核管理', '队列调度', '系统优化', 'IPv6'].map(title => ({ title, items: kernelMenu.filter(item => item.group === title) })))
const kernelStatus = computed(() => {
  const current = snapshot.value?.kernel.current || 'unknown'
  return { label: current === 'bbr2' ? 'BBR V3' : current === 'bbr' ? '标准 BBR' : current, qdisc: snapshot.value?.kernel.qdisc || '未知' }
})
const kernelRefreshing = ref(false)
async function refreshKernelStatus() {
  if (kernelRefreshing.value) return
  kernelRefreshing.value = true
  try {
    const status = await api<KernelInfo>('/kernel-status')
    if (snapshot.value) snapshot.value.kernel = status
    toast('内核状态已刷新。')
  } catch (error) {
    toast((error as Error).message)
  } finally {
    kernelRefreshing.value = false
  }
}
const kernelConfirm = ref<typeof kernelMenu[number]>()
const smartDialog = ref(false)
const smartRegion = ref<'asia' | 'overseas'>('asia')
const smartRtt = ref(50)
function requestKernelMenu(item: typeof kernelMenu[number]) { kernelConfirm.value = item }
function isKernelAvailable(item: typeof kernelMenu[number]) {
  const kernel = snapshot.value?.kernel
  if (!kernel) return false
  if (item.action === 'qdisc') return kernel.qdiscSupported !== false
  if (item.action === 'bbr-profile' || item.action === 'bbr-menu' || item.action === 'bbr-smart') return kernel.bbrV3Supported !== false
  return item.action !== 'congestion' || (!!item.value && kernel.allowed.includes(item.value))
}
function isKernelActive(item: typeof kernelMenu[number]) {
  const kernel = snapshot.value?.kernel
  return (item.action === 'congestion' && kernel?.current === item.value) || (item.action === 'qdisc' && kernel?.qdisc === item.value) || (item.id === 'bbr-standard' && kernel?.bbrV3Active && kernel.bbrV3ActiveProfile === 'standard') || (item.id === 'bbr-max' && kernel?.bbrV3Active && kernel.bbrV3ActiveProfile === 'max') || (item.id === 'bandwidth' && kernel?.smartOptimization === true) || (item.id === 'tcp' && kernel?.apacTuning === true) || (item.id === 'crazy' && kernel?.crazyMode === true) || (item.id === 'tcp' && kernel?.apacTuning === true) || (item.id === 'crazy' && kernel?.crazyMode === true) || (item.id === 'ipv6-off' && kernel?.ipv6Disabled === true) || (item.id === 'ipv6-on' && kernel?.ipv6Disabled === false)
}
function isKernelInstalled(item: typeof kernelMenu[number]) {
  const kernel = snapshot.value?.kernel
  return (item.id === 'bbr-standard' && kernel?.bbrV3StandardInstalled === true) || (item.id === 'bbr-max' && kernel?.bbrV3MaxInstalled === true) || (item.id === 'bandwidth' && kernel?.smartOptimization === true)
}
async function applyKernelMenu(item: typeof kernelMenu[number]) {
  kernelConfirm.value = undefined
  if (item.action === 'congestion') await run('set-congestion', { algorithm: item.value })
  else if (item.action === 'qdisc') await run('set-qdisc', { qdisc: item.value })
  else if (item.action === 'bbr-profile') await run('bbr-profile', { profile: item.value })
  else if (item.action === 'bbr-menu') await run('bbr-menu', { menu: item.value })
  else if (item.action === 'bbr-smart') {
    smartRegion.value = 'asia'
    smartRtt.value = 50
    smartDialog.value = true
  }
  else window.open(bbrV3ScriptUrl, '_blank', 'noopener,noreferrer')
}
async function applySmartOptimization() {
  if (!Number.isInteger(smartRtt.value) || smartRtt.value < 1 || smartRtt.value > 5000) { toast('RTT 必须是 1–5000 的整数。'); return }
  smartDialog.value = false
  await run('bbr-smart', { region: smartRegion.value, rttMs: smartRtt.value })
}
async function uninstall() { uninstallConfirm.value = false; await run('uninstall') }
async function save() { confirm.value = false; await run('set-entry', { cfEntry: entry.value.trim() }) }
</script>
<template>
  <div class="page"><div class="page-heading"><div><h1>连接设置</h1><p>调整入口和查看端口，让客户端与服务器保持一致。</p></div></div>
    <div class="settings-grid"><section class="panel settings-section"><div class="section-heading"><Globe2 :size="22" /><div><h2>Cloudflare 入口</h2><p>修改入口后，客户端需要更新订阅再重新连接。</p></div></div><form @submit.prevent="confirm = true"><label for="settings-cf">入口 IPv4 / 域名</label><input id="settings-cf" v-model="entry" required maxlength="253" pattern="[a-zA-Z0-9.\-]+" /><p class="field-hint">填写 auto 使用当前隧道域名。不含协议或端口。</p><button class="button primary" :disabled="!!activeJob || !snapshot?.installed || entry === snapshot.settings.cf_entry"><Settings2 :size="16" />保存入口</button></form></section><section class="panel settings-section"><div class="section-heading"><Cable :size="22" /><div><h2>当前端口映射</h2><p>公网端口 → 服务器内部端口</p></div></div><dl class="port-mappings"><div><dt>REALITY <span>TCP</span></dt><dd>{{ snapshot?.settings.public_port }}<ArrowRight :size="13" />{{ snapshot?.settings.reality_port }}</dd></div><div><dt>Hysteria2 <span>UDP</span></dt><dd>{{ snapshot?.settings.hy2_public_port }}<ArrowRight :size="13" />{{ snapshot?.settings.hy2_port }}</dd></div><div><dt>订阅备用 <span>TCP</span></dt><dd>{{ snapshot?.settings.subscription_public_port }}<ArrowRight :size="13" />{{ snapshot?.settings.subscription_port }}</dd></div></dl><RouterLink to="/install" class="text-link">通过安装向导调整端口<ArrowRight :size="15" /></RouterLink></section></div>
    <section class="panel kernel-menu-panel"><div class="kernel-menu-heading"><div><h2>内核优化工作台</h2></div><div class="kernel-heading-right"><div class="kernel-live-status" aria-live="polite"><span class="status-dot green" /><span class="kernel-live-copy"><small>当前内核状态</small><strong>{{ kernelStatus.label }}</strong><em>qdisc {{ kernelStatus.qdisc }}</em></span><button class="kernel-status-refresh icon-button" :disabled="kernelRefreshing" aria-label="刷新内核状态" title="刷新内核状态" @click="refreshKernelStatus"><RefreshCw :size="14" :class="{ spin: kernelRefreshing }" /></button></div><span class="kernel-menu-count">{{ kernelMenu.length }} 项</span></div></div><div class="kernel-groups"><section v-for="group in kernelGroups" :key="group.title" class="kernel-group-section"><div class="kernel-group-heading"><h3>{{ group.title }}</h3><span>{{ group.items.length }} 项</span></div><div class="kernel-menu-grid"><button v-for="item in group.items" :key="item.id" class="kernel-menu-card" :class="item.tone" :disabled="!isKernelAvailable(item)" @click="requestKernelMenu(item)"><span class="kernel-menu-meta"><span v-if="isKernelActive(item)" class="kernel-menu-active">当前启用</span><span v-else-if="isKernelInstalled(item)" class="kernel-menu-installed">已安装 / 已配置</span><span v-else-if="!isKernelAvailable(item)" class="kernel-menu-unavailable">当前系统不可用</span></span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></button></div></section></div></section>
    <section v-if="snapshot?.demo" class="panel deployment-guide"><div class="section-heading"><Terminal :size="23" /><div><h2>连接真实服务器</h2><p>面板后台需要与代理服务部署在同一台 Linux 服务器。</p></div></div><ol><li><strong>一键安装面板</strong><p>以 root 在目标 Linux 服务器执行 README 中的一键命令，安装器会下载预构建包并创建服务。</p></li><li><strong>首次运行设置密码</strong><p>安装器会自动准备运行环境，安装或更新后使用固定面板密码 12345。完整部署步骤见项目 README.md。</p></li><li><strong>通过 SSH 转发访问</strong><p>默认仅监听服务器本机 8787 端口。在你的电脑建立转发后打开本地地址。</p><div class="command-line"><code>ssh -L 8787:127.0.0.1:8787 root@YOUR_SERVER</code><button class="icon-button" aria-label="复制 SSH 转发命令" @click="copy('ssh -L 8787:127.0.0.1:8787 root@YOUR_SERVER')"><Terminal :size="17" /></button></div></li></ol><div class="notice-box"><ShieldCheck :size="18" /><span>公网访问请配置 HTTPS 反向代理与 PANEL_ORIGIN，保留登录认证。</span></div></section>
    <div v-else class="notice-box"><Info :size="20" /><span>后台默认只监听本机地址。公网访问使用 HTTPS 反向代理，并将 PANEL_ORIGIN 配置为面板的实际访问域名。</span></div>
    <section v-if="snapshot?.installed" class="panel danger-settings"><div><h2>卸载脚本管理的组件</h2><p>删除 Xray、Cloudflare、Hy2、MTProto、订阅服务及脚本托管的配置。SSH 和手工部署的服务不受影响。</p></div><button class="button danger-ghost" :disabled="!!activeJob" @click="uninstallConfirm = true">卸载全部组件</button></section>
    <ConfirmDialog :open="confirm" title="保存 Cloudflare 入口？" :message="`将入口调整为 ${entry}，并重新导出节点。请在客户端更新订阅后重新连接 CF 节点。`" confirm-label="保存并更新" @close="confirm = false" @confirm="save" />
    <ConfirmDialog :open="uninstallConfirm" title="确认卸载全部组件？" message="此操作会删除脚本管理的节点、订阅、TG 代理、服务和配置，完成后需要重新安装才能恢复。" confirm-label="确认卸载" :danger="true" @close="uninstallConfirm = false" @confirm="uninstall" />
    <ConfirmDialog :open="!!kernelConfirm" :title="`确认${kernelConfirm?.title || '执行内核操作'}？`" :message="kernelConfirm?.action === 'bbr-profile' ? `将自动安装最新版 BBR V3 ${kernelConfirm.value === 'standard' ? '标准版' : 'Max'}。安装新内核后通常需要重启服务器才能切换生效。` : kernelConfirm?.action === 'bbr-menu' ? `将执行 BBR V3 脚本菜单 ${kernelConfirm.value}，可能修改内核、IPv6 或系统网络参数。请确认服务器环境。` : kernelConfirm?.action === 'bbr-smart' ? '将运行测速并根据你提供的真实 RTT 调整 BBR V3 缓冲区参数。' : kernelConfirm?.action === 'info' ? `该功能需要交互式输入，将打开 BBR V3 脚本地址处理“${kernelConfirm?.title}”。` : `将应用“${kernelConfirm?.title}”，当前运行中的连接可能短暂中断。`" confirm-label="确认继续" @close="kernelConfirm = undefined" @confirm="kernelConfirm && applyKernelMenu(kernelConfirm)" />
    <div v-if="smartDialog" class="smart-dialog-backdrop" role="presentation" @click.self="smartDialog = false"><section class="smart-dialog" role="dialog" aria-modal="true" aria-labelledby="smart-dialog-title"><div class="dialog-top"><span class="dialog-icon"><Gauge :size="23" /></span><button class="icon-button" aria-label="关闭 BBR V3 智能优化" @click="smartDialog = false"><X :size="20" /></button></div><h2 id="smart-dialog-title">配置 BBR V3 智能优化</h2><p>选择线路档位并填写客户端测得的真实 RTT。面板会直接执行脚本，不再弹出终端输入框。</p><div class="smart-dialog-fields"><label>线路模式<select v-model="smartRegion"><option value="asia">亚太档位</option><option value="overseas">美欧档位</option></select></label><label>真实 RTT（毫秒）<input v-model.number="smartRtt" type="number" min="1" max="5000" step="1" inputmode="numeric" /></label></div><p class="field-hint">RTT 请填写客户端到服务器的实际延迟，范围 1–5000 毫秒。</p><div class="dialog-actions"><button class="button secondary" @click="smartDialog = false">取消</button><button class="button primary" @click="applySmartOptimization">开始优化</button></div></section></div>
  </div>
</template>










