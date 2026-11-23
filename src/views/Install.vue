<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Server, Layers, Globe2, Zap, ArrowRight, Check, ShieldCheck, Terminal, ChevronDown, Rocket, Info } from 'lucide-vue-next'
import { snapshot, activeJob, run } from '../store'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const router = useRouter()
const s = snapshot.value!.settings
const form = reactive({ server: s.server, realityPort: s.reality_port, publicPort: s.public_port, hy2Port: s.hy2_port, hy2PublicPort: s.hy2_public_port, subscriptionPort: s.subscription_port, subscriptionPublicPort: s.subscription_public_port, outputDir: s.output_dir || '', cfEntry: s.cf_entry, tunnelProtocol: s.tunnel_protocol, hy2: s.hy2_enabled })
const advanced = ref(false), confirm = ref(false), submitting = ref(false), validationError = ref('')
const summary = computed(() => [
  { label: 'Xray Core', detail: 'REALITY + WebSocket', icon: Layers },
  { label: 'Cloudflare Tunnel', detail: 'HTTPS 安全入口', icon: Globe2 },
  ...(form.hy2 ? [{ label: 'Hysteria 2', detail: 'UDP 高速直连', icon: Zap }] : []),
  { label: '订阅服务', detail: '通用 / Mihomo', icon: Layers },
])
function review() {
  validationError.value = ''
  if (!form.server.trim() || /[\s/:;\$]/.test(form.server) || !form.cfEntry.trim() || /[\s/:;\$]/.test(form.cfEntry)) { validationError.value = '请填写有效 IPv4 或域名，不含协议、路径或端口。'; return }
  confirm.value = true
}
async function deploy() {
  confirm.value = false; submitting.value = true
  const job = await run('install', { ...form, server: form.server.trim(), cfEntry: form.cfEntry.trim() })
  submitting.value = false
  if (job) router.push('/logs')
}
</script>
<template>
  <div class="page">
    <div class="page-heading"><div><h1>安装与部署</h1><p>配置一次，交给后台。部署进度会实时同步到这里。</p></div><span class="subtle-label"><ShieldCheck :size="17" />更新时保留账号与密钥</span></div>
    <div class="stepper" aria-label="部署步骤"><span class="current"><i>1</i>配置节点</span><span class="step-line" /><span><i>2</i>确认部署</span><span class="step-line" /><span><i>3</i>查看实时进度</span></div>
    <div v-if="activeJob" class="notice-box"><Info :size="19" /><span>已有任务正在执行。可继续填写，任务结束后再提交。</span><RouterLink to="/logs" class="text-link">查看进度<ArrowRight :size="15" /></RouterLink></div>
    <div class="install-grid">
      <form id="install-form" class="panel install-form" @submit.prevent="review">
        <div class="form-section"><div class="section-heading"><Server :size="20" /><div><h2>服务器连接</h2><p>填写客户端访问的公网地址，NAT 服务器需配置端口映射。</p></div></div><label for="server">公网 IPv4 / 域名 <span class="required">*</span></label><input id="server" v-model="form.server" placeholder="例如 203.0.113.24 或 vpn.example.com" required maxlength="253" autocomplete="off" :aria-invalid="!!validationError" aria-describedby="server-hint" /><p id="server-hint" class="field-hint">仅填写地址，不包含 http:// 或端口。</p></div>
        <div class="form-section"><div class="section-heading"><Layers :size="20" /><div><h2>协议与组件</h2><p>基础组件会一起安装，可按需要开启 Hysteria2。</p></div></div><div class="protocol-options"><div class="protocol-option fixed"><span class="protocol-icon"><Layers :size="21" /></span><div><strong>Xray + Cloudflare</strong><small>REALITY 直连与 WebSocket 隧道</small></div><span class="fixed-check"><Check :size="16" /></span></div><label class="protocol-option" :class="{ selected: form.hy2 }"><span class="protocol-icon green-tint"><Zap :size="21" /></span><span><strong>Hysteria 2</strong><small>适合高延迟网络的 UDP 连接</small></span><input v-model="form.hy2" type="checkbox" class="toggle-input" /><span class="toggle-track" aria-hidden="true" /></label></div></div>
        <div class="form-section"><div class="section-heading"><Globe2 :size="20" /><div><h2>Cloudflare 入口</h2><p>使用指定入口，或填写 auto 跟随当前隧道域名。</p></div></div><label for="cf-entry">入口 IP / 域名</label><input id="cf-entry" v-model="form.cfEntry" required maxlength="253" list="cf-entries" /><datalist id="cf-entries"><option value="cdns.doon.eu.org" /><option value="auto" /></datalist><p class="field-hint">临时隧道重建后域名可能变化，需要重新导入 HTTPS 订阅。</p></div>
        <button type="button" class="advanced-toggle" :aria-expanded="advanced" @click="advanced = !advanced"><span>端口与高级配置</span><ChevronDown :size="18" :class="{ rotated: advanced }" /></button>
        <div v-if="advanced" class="advanced-fields"><div class="field-grid"><label>REALITY 内部 TCP<input v-model.number="form.realityPort" type="number" min="1024" max="65535" required /></label><label>REALITY 公网 TCP<input v-model.number="form.publicPort" type="number" min="1024" max="65535" required /></label><label v-if="form.hy2">Hy2 内部 UDP<input v-model.number="form.hy2Port" type="number" min="1024" max="65535" required /></label><label v-if="form.hy2">Hy2 公网 UDP<input v-model.number="form.hy2PublicPort" type="number" min="1024" max="65535" required /></label><label>订阅内部 TCP<input v-model.number="form.subscriptionPort" type="number" min="1024" max="65535" required /></label><label>订阅公网 TCP<input v-model.number="form.subscriptionPublicPort" type="number" min="1024" max="65535" required /></label><label>隧道协议<select v-model="form.tunnelProtocol"><option value="http2">HTTP/2（默认）</option><option value="quic">QUIC</option></select></label><label>节点导出目录<input v-model="form.outputDir" placeholder="留空使用默认目录" /><small>填写 Linux 绝对路径，例如 /srv/vpn-clients</small></label></div><p class="field-hint">TCP 与 UDP 可以使用同一端口号；公网端口需与你的 NAT 映射一致。</p></div>
        <p v-if="validationError" class="field-error form-error" role="alert">{{ validationError }}</p>
        <div class="form-footer"><span><ShieldCheck :size="15" />后台执行，关闭页面也不中断</span><button class="button primary" :disabled="!!activeJob || submitting"><Rocket :size="17" />{{ submitting ? '提交中…' : snapshot?.installed ? '更新部署' : '开始部署' }}</button></div>
      </form>
      <aside class="install-aside"><section class="panel deployment-plan"><h2>本次部署清单</h2><p>以下组件将由脚本统一管理。</p><div v-for="item in summary" :key="item.label" class="plan-row"><component :is="item.icon" :size="18" /><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span><Check :size="16" /></div><div class="plan-target"><span>目标服务器</span><strong class="mono">{{ form.server || '等待填写' }}</strong><span>配置保存位置</span><code>/etc/personal-vpn-stack</code></div></section><div class="install-tip"><Terminal :size="20" /><h3>每一步，都有迹可循。</h3><p>下载校验、配置生成、服务启动和就绪检查，全部记录在任务日志中。失败时可查看脚本的回滚结果。</p><RouterLink to="/logs" class="text-link">打开任务日志<ArrowRight :size="15" /></RouterLink></div></aside>
    </div>
    <ConfirmDialog :open="confirm" title="确认安装 / 更新节点？" :message="`将在 ${form.server} 执行安装，可能下载依赖并重启代理服务。现有配置的保留与失败回滚由原部署脚本处理。${snapshot?.demo ? '当前为演示模式，不会实际安装。' : ''}`" confirm-label="确认部署" @close="confirm = false" @confirm="deploy" />
  </div>
</template>
