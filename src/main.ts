import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Install from './views/Install.vue'
import Services from './views/Services.vue'
import Nodes from './views/Nodes.vue'
import Logs from './views/Logs.vue'
import Settings from './views/Settings.vue'
import './style.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard, meta: { title: '运行总览' } },
    { path: '/install', component: Install, meta: { title: '安装与部署' } },
    { path: '/services', component: Services, meta: { title: '服务管理' } },
    { path: '/nodes', component: Nodes, meta: { title: '节点与订阅' } },
    { path: '/logs', component: Logs, meta: { title: '任务与日志' } },
    { path: '/settings', component: Settings, meta: { title: '连接设置' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
createApp(App).use(router).mount('#app')
