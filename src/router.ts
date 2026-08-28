import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
} from 'vue-router'
import AppShell from './AppShell.vue'

const routes = [
  { path: '/', name: 'today', component: AppShell },
  { path: '/attendance/:pathMatch(.*)*', name: 'attendance', component: AppShell },
  { path: '/leave/:pathMatch(.*)*', name: 'leave', component: AppShell },
  { path: '/reports/:pathMatch(.*)*', name: 'reports', component: AppShell },
  { path: '/settings/:pathMatch(.*)*', name: 'settings', component: AppShell },
  { path: '/:pathMatch(.*)*', name: 'fallback', component: AppShell },
]

export function createAppRouter() {
  const history = typeof window === 'undefined'
    ? createMemoryHistory()
    : createWebHistory()

  return createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })
}
