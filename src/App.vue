<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { LayoutDashboard, Layers, Cable, ScrollText, Settings2, Rocket, ArrowUpRight, ChevronRight, LogOut, Menu, X, Radio, LoaderCircle, ShieldCheck, BookOpen, Eye, EyeOff } from 'lucide-vue-next'
import { snapshot, initialize, authenticated, loading, connected, error, notice, activeJob, api, connect, disconnect, time } from './store'
import type { Snapshot } from './types'
const route = useRoute()
const menuOpen = ref(false), username = ref('admin'), password = ref('000000'), loginError = ref(''), signingIn = ref(false), reveal = ref(false), helpOpen = ref(false)
const nav = [
  { path: '/', label: '运行总览', icon: LayoutDashboard },
  { path: '/install', label: '安装与部署', icon: Rocket },
  { path: '/services', label: '服务管理', icon: Layers },
  { path: '/settings', label: '连接设置', icon: Settings2 },
  { path: '/nodes', label: '节点与订阅', icon: Cable },
  { path: '/logs', label: '任务与日志', icon: ScrollText },
]
async function login() {
  signingIn.value = true; loginError.value = ''
  try {
    await api('/login', { method: 'POST', body: JSON.stringify({ username: username.value, password: password.value }) })
    password.value = ''; snapshot.value = await api<Snapshot>('/snapshot'); authenticated.value = true; connect()
  } catch (e) { loginError.value = (e as Error).message }
  finally { signingIn.value = false }
}
async function logout() {
  await api('/logout', { method: 'POST', body: '{}' }); disconnect(); snapshot.value = undefined; authenticated.value = false
}
onMounted(initialize)
onUnmounted(disconnect)
</script>
<template>
  <div v-if="loading" class="boot-screen"><LoaderCircle class="spin" :size="28" /><p>正在连接管理台…</p></div>
  <main v-else-if="!authenticated" class="login-screen">
    <div class="login-shell">
      <section class="login-intro" aria-label="Xray Console UI 管理台介绍"><div class="brand login-brand"><img src="/favicon.svg" alt="" /><span>xray<span class="brand-period">.</span></span><span class="edition">CONSOLE UI</span></div><div class="login-intro-copy"><p class="login-kicker"><span class="status-dot green" />PERSONAL NETWORK</p><h1>让每一次连接，<br /><strong>都清晰可见。</strong></h1><p>在一处完成节点部署、服务检查、测速和订阅管理。</p></div><div class="login-signals"><span><strong>实时状态</strong><small>服务、节点、隧道</small></span><span><strong>后台任务</strong><small>日志持续记录</small></span><span><strong>私有数据</strong><small>留在你的服务器</small></span></div></section>
      <div class="login-panel">
        <h2>登录管理台</h2><p class="login-subtitle">使用服务器管理员账号继续。</p>
        <form @submit.prevent="login"><label for="username">管理账号</label><input id="username" v-model="username" autocomplete="username" required autofocus /><label for="password" class="login-password-label">管理密码</label><div class="password-input"><input id="password" v-model="password" :type="reveal ? 'text' : 'password'" autocomplete="current-password" required /><button type="button" class="icon-button" :aria-label="reveal ? '隐藏密码' : '显示密码'" @click="reveal = !reveal"><component :is="reveal ? EyeOff : Eye" :size="19" /></button></div>
          <p v-if="loginError || error" class="field-error" role="alert">{{ loginError || error }}</p>
          <button class="button primary" :disabled="signingIn"><LoaderCircle v-if="signingIn" class="spin" :size="17" />{{ signingIn ? '正在登录…' : '进入管理台' }}<ChevronRight v-if="!signingIn" :size="18" /></button>
        </form><span class="login-foot"><ShieldCheck :size="15" />仅供服务器所有者访问</span>
      </div>
    </div>
  </main>
  <div v-else class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <button v-if="menuOpen" class="sidebar-scrim" aria-label="关闭导航" @click="menuOpen = false" />
    <aside class="sidebar" :class="{ 'is-open': menuOpen }">
      <RouterLink to="/" class="brand" aria-label="Xray Console UI 首页" @click="menuOpen = false"><img src="/favicon.svg" alt="" /><span>xray<span class="brand-period">.</span></span><span class="edition">CONSOLE UI</span></RouterLink>
      <p class="nav-label">工作空间</p>
      <nav aria-label="主要导航"><RouterLink v-for="item in nav" :key="item.path" :to="item.path" class="nav-item" :class="{ active: route.path === item.path }" @click="menuOpen = false"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span><span v-if="item.path === '/logs' && activeJob" class="nav-live" /></RouterLink></nav>
      <div class="sidebar-bottom">
        <div class="sidebar-health"><span class="health-orbit"><ShieldCheck :size="21" /></span><strong>独立部署，安心掌控</strong><p>配置与密钥保存在你的服务器。</p><RouterLink to="/settings" @click="menuOpen = false">查看连接配置<ArrowUpRight :size="14" /></RouterLink></div>
        <button class="nav-item help-button" @click="helpOpen = !helpOpen"><BookOpen :size="18" /><span>使用帮助</span><ArrowUpRight :size="15" /></button>
        <div class="profile"><span class="avatar">A</span><span><strong>Administrator</strong><small>服务器管理员</small></span><button v-if="!snapshot?.demo" class="icon-button" aria-label="退出登录" @click="logout"><LogOut :size="17" /></button><span v-else class="local-tag">本地</span></div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" aria-label="打开导航" :aria-expanded="menuOpen" @click="menuOpen = true"><Menu :size="21" /></button><span>工作空间</span><ChevronRight :size="14" /><strong>{{ route.meta.title }}</strong></div><div class="topbar-right"><span class="live-label" :class="{ disconnected: !connected }"><span class="status-dot" />{{ connected ? '实时连接' : '连接中断' }}</span><span class="topbar-divider" /><span class="version-label">v0.1.5</span><span class="top-avatar">A</span></div></header>
      <div v-if="snapshot?.demo" class="demo-banner"><span><Radio :size="16" /><strong>演示模式</strong><span>当前展示模拟服务器，操作不会修改真实环境。</span></span><RouterLink to="/settings">连接真实服务器<ArrowUpRight :size="14" /></RouterLink></div>
      <div v-if="error" class="connection-banner" role="alert">{{ error }}<span v-if="snapshot">最后更新 {{ time(snapshot.updatedAt) }}</span></div>
      <main id="main-content" class="main-content" tabindex="-1"><RouterView v-if="snapshot" /><div v-else class="empty-state"><LoaderCircle class="spin" /><p>正在读取服务器状态…</p><button class="button secondary" @click="initialize">重新连接</button></div></main>
      <footer class="page-footer"><span>Xray Console UI <span class="footer-dot">·</span> 让连接更简单</span><span v-if="snapshot">最后同步 {{ time(snapshot.updatedAt) }}<span class="status-dot" :class="connected ? 'green' : 'amber'" /></span></footer>
    </div>
    <RouterLink v-if="activeJob && route.path !== '/logs'" to="/logs" class="active-task"><LoaderCircle :size="18" class="spin" /><div><strong>{{ activeJob.label }}</strong><small>{{ activeJob.logs.at(-1) || '任务准备中…' }}</small></div><span>查看进度</span><ChevronRight :size="17" /></RouterLink>
    <div v-if="helpOpen" class="help-popover"><div class="panel-title"><h2>开始使用 Xray Console UI</h2><button class="icon-button" aria-label="关闭使用帮助" @click="helpOpen = false"><X :size="18" /></button></div><ol><li>在「安装与部署」填写服务器公网地址和端口。</li><li>点击开始部署，在「任务与日志」查看执行结果。</li><li>在「节点与订阅」复制地址，导入代理客户端。</li></ol><p>真实后台需部署在目标 Linux 服务器。完整步骤见项目 README.md。</p><RouterLink to="/install" class="button primary" @click="helpOpen = false">前往安装向导<ChevronRight :size="16" /></RouterLink></div>
  </div>
  <Transition name="toast"><div v-if="notice" class="toast-message" role="status">{{ notice }}</div></Transition>
</template>
