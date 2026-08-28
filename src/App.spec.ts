import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from './router'
import App from './App.vue'

async function renderAt(path: string) {
  const router = createAppRouter()
  await router.push(path)
  await router.isReady()

  const app = createSSRApp(App)
  app.use(router)

  return renderToString(app)
}

describe('應用程式殼層', () => {
  it('根路由渲染繁中應用程式殼層', async () => {
    const html = await renderAt('/')

    expect(html).toContain('線上出勤')
    expect(html).toContain('主要導覽')
    expect(html).toContain('今日')
  })

  it('深連結仍顯示同一個應用程式殼層', async () => {
    const html = await renderAt('/attendance/calendar')

    expect(html).toContain('線上出勤')
    expect(html).toContain('主要導覽')
    expect(html).toContain('data-shell="attendance"')
  })
})
