<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas px-5 py-5 text-ink sm:px-10 lg:px-16">
    <a class="fixed start-3 top-3 z-10 -translate-y-[180%] rounded-[0.5rem] bg-ink px-3 py-2 text-surface transition-transform duration-200 focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:focus-visible:translate-y-0" href="#info-main">跳至主要內容</a>

    <header class="mx-auto flex min-h-12 w-full max-w-[76rem] items-center justify-between gap-4">
      <RouterLink class="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-[-0.035em]" to="/login" aria-label="回到線上出勤登入頁">
        <span class="grid size-8 place-items-center rounded-[0.625rem] bg-accent text-sm tracking-normal text-surface" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </RouterLink>
      <span class="text-right text-[0.75rem] font-bold tracking-[0.08em] text-muted">協助與回報</span>
    </header>

    <main id="info-main" tabindex="-1" class="mx-auto flex w-full max-w-[76rem] flex-1 flex-col py-12 sm:py-16 lg:py-20">
      <section class="max-w-[49rem] border-t border-accent pt-5" aria-labelledby="support-title">
        <p class="inline-flex items-center gap-2 text-[0.75rem] font-bold tracking-[0.12em] text-accent"><span class="inline-block h-px w-6 bg-current" aria-hidden="true"></span>支援</p>
        <h1 id="support-title" class="mt-5 max-w-[14ch] font-display text-[clamp(2.35rem,6vw,4.75rem)] font-semibold leading-[1.06] tracking-[-0.055em] text-balance">遇到問題，先找到最短的下一步。</h1>
        <p class="mt-6 max-w-[39rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-relaxed text-muted text-pretty">目前是 Google 登入預覽版本。如果畫面和預期不同，請把你看到的訊息與操作步驟寄來，我們會依目前開放的範圍回覆。</p>
        <a class="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" href="mailto:a5852241@gmail.com">寄信給支援 <span aria-hidden="true">↗</span></a>
      </section>

      <div class="mt-12 grid gap-5 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)] lg:items-start lg:gap-8">
        <article class="min-w-0 rounded-2xl border border-line bg-surface px-5 shadow-[var(--shadow)] sm:px-8">
          <section class="py-6 sm:py-10" aria-labelledby="support-login-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">01 / 登入問題</p>
            <h2 id="support-login-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">Google 登入沒有完成</h2>
            <ol class="mt-5 grid max-w-[65ch] gap-3 ps-6 leading-relaxed text-muted marker:font-bold marker:text-accent">
              <li>確認瀏覽器允許開啟 Google 登入頁，並重新從登入頁開始。</li>
              <li>如果回到本服務後看到錯誤訊息，請記下訊息內容，不要反覆送出敏感資訊。</li>
              <li>仍無法完成時，寄信告訴我們使用的裝置、瀏覽器與發生步驟。</li>
            </ol>
          </section>

          <section class="border-t border-line py-6 sm:py-10" aria-labelledby="support-preview-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">02 / 預覽範圍</p>
            <h2 id="support-preview-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">有些入口目前只呈現介面</h2>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">預覽環境可能尚未開放 Google 登入。當 Supabase 公開設定不存在時，登入頁會明確顯示「Google 登入尚未開放」，不會提供可操作的登入按鈕。</p>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">登入本身也不會建立或修改出勤資料；相關資料功能會在後續版本逐步開放。</p>
          </section>

          <section class="border-t border-line py-6 sm:py-10" aria-labelledby="support-delete-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">03 / 帳號資料</p>
            <h2 id="support-delete-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">帳號刪除目前尚未提供</h2>
            <div class="mt-5 rounded-[0.625rem] border border-line border-s-accent border-s-4 bg-surface-soft px-4 py-4">
              <strong>這不是已上線的自助服務。</strong>
              <p class="mt-1.5 max-w-[65ch] leading-relaxed text-muted text-pretty">帳號資料刪除屬於後續 MVP 資料模型切片，必須先定義資料範圍與關聯紀錄後才會實作。若要回報這項需求，請寄信說明；我們會回覆目前能處理的範圍，不會把規劃中的功能當成現有功能。</p>
            </div>
          </section>

          <section class="border-t border-line py-6 sm:py-10" aria-labelledby="support-contact-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">04 / 聯絡我們</p>
            <h2 id="support-contact-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">一封信，帶上這些資訊就夠了</h2>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">請提供問題發生的頁面、看到的錯誤文字，以及重現步驟。若方便，也可以附上瀏覽器與裝置名稱；請不要寄送密碼、驗證碼或 OAuth token。</p>
            <a class="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:-translate-y-px hover:text-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" href="mailto:a5852241@gmail.com">a5852241@gmail.com <span aria-hidden="true">↗</span></a>
          </section>
        </article>

        <aside class="lg:sticky lg:top-6" aria-label="支援頁快速資訊">
          <div class="grid gap-2 rounded-2xl border border-accent-soft bg-accent-soft p-5">
            <p class="text-[0.6875rem] font-bold tracking-[0.1em] text-muted">回報前</p>
            <strong class="font-display text-xl font-semibold tracking-[-0.03em]">不用先整理成報告</strong>
            <p class="text-[0.875rem] leading-relaxed text-muted">一段錯誤訊息，加上你做了什麼，就能幫助我們定位問題。</p>
            <RouterLink class="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:-translate-y-px hover:text-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" to="/login">回到登入頁 <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </aside>
      </div>
    </main>

    <footer class="mx-auto flex w-full max-w-[76rem] flex-wrap items-center justify-between gap-4 border-t border-line pt-4 text-[0.8125rem] text-muted">
      <span>把問題說清楚，下一步就會更簡單。</span>
      <RouterLink class="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:-translate-y-px hover:text-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" to="/login">回到登入頁 <span aria-hidden="true">↗</span></RouterLink>
    </footer>
  </div>
</template>
