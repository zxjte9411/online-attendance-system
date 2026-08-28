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
      <span class="text-right text-[0.75rem] font-bold tracking-[0.08em] text-muted">資料與使用說明</span>
    </header>

    <main id="info-main" tabindex="-1" class="mx-auto flex w-full max-w-[76rem] flex-1 flex-col py-12 sm:py-16 lg:py-20">
      <section class="max-w-[49rem] border-t border-accent pt-5" aria-labelledby="privacy-title">
        <p class="inline-flex items-center gap-2 text-[0.75rem] font-bold tracking-[0.12em] text-accent"><span class="inline-block h-px w-6 bg-current" aria-hidden="true"></span>隱私權</p>
        <h1 id="privacy-title" class="mt-5 max-w-[14ch] font-display text-[clamp(2.35rem,6vw,4.75rem)] font-semibold leading-[1.06] tracking-[-0.055em] text-balance">先說清楚，你的帳號資料會去哪裡。</h1>
        <p class="mt-6 max-w-[39rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-relaxed text-muted text-pretty">這份說明對應目前的 Google 登入預覽版本。只說明現在已經存在的處理方式，不把未完成的功能寫成承諾。</p>
        <p class="mt-4 text-[0.8125rem] text-muted">最後更新：2026 年 8 月 28 日</p>
      </section>

      <div class="mt-12 grid gap-5 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)] lg:items-start lg:gap-8">
        <article class="min-w-0 rounded-2xl border border-line bg-surface px-5 shadow-[var(--shadow)] sm:px-8">
          <section class="py-6 sm:py-10" aria-labelledby="privacy-data-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">01 / 目前會處理什麼</p>
            <h2 id="privacy-data-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">Google 登入只用來確認你是誰</h2>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">登入時，你會被帶往 Google 完成身分驗證。系統透過 Supabase Auth 接收 Google 登入所需的帳號識別資料，例如電子郵件地址、顯示名稱、頭像或 Google 提供的識別資訊；實際欄位依 Google 與 Supabase 的回傳內容而定。</p>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">這些資料目前用於建立與維持登入工作階段，以及判斷你是否能進入需要登入的頁面。我們不會在登入時要求你填寫額外的個人資料。</p>
          </section>

          <section class="border-t border-line py-6 sm:py-10" aria-labelledby="privacy-purpose-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">02 / 使用目的</p>
            <h2 id="privacy-purpose-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">不為登入以外的事情多拿資料</h2>
            <ul class="mt-5 grid max-w-[65ch] gap-3 ps-5 leading-relaxed text-muted marker:font-bold marker:text-accent">
              <li>確認帳號身分，讓你可以登入線上出勤。</li>
              <li>維持登入狀態，並把登入後的頁面存取限制在已驗證的帳號。</li>
              <li>目前的登入流程不會建立或修改出勤資料，也沒有在這個流程中加入廣告或行銷用途。</li>
            </ul>
          </section>

          <section class="border-t border-line py-6 sm:py-10" aria-labelledby="privacy-service-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">03 / 服務提供者</p>
            <h2 id="privacy-service-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">Google 與 Supabase 各自負責一段流程</h2>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">Google 負責身分驗證；Supabase Auth 負責傳遞 OAuth 結果並管理本服務的登入工作階段。這表示登入時會依照這兩項服務各自的隱私權政策與設定處理資料。</p>
            <p class="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">登入工作階段的保存方式與期限，會受到 Supabase 專案設定及瀏覽器狀態影響。本頁不宣稱超出目前程式實際提供的保存或管理功能。</p>
          </section>

          <section class="border-t border-line py-6 sm:py-10" aria-labelledby="privacy-delete-title">
            <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">04 / 帳號資料刪除</p>
            <h2 id="privacy-delete-title" class="mt-2 max-w-[24ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.05em] text-balance">刪除功能還不是現在提供的功能</h2>
            <div class="mt-5 rounded-[0.625rem] border border-line border-s-accent border-s-4 bg-surface-soft px-4 py-4">
              <strong>目前沒有自助刪除帳號或帳號資料的操作入口。</strong>
              <p class="mt-1.5 max-w-[65ch] leading-relaxed text-muted text-pretty">帳號資料刪除會放在後續的 MVP 資料模型切片中，待資料範圍、關聯紀錄與刪除規則完成後再實作。這是後續規劃，不是目前已提供的功能。</p>
            </div>
          </section>
        </article>

        <aside class="lg:sticky lg:top-6" aria-label="隱私權說明導覽">
          <div class="grid gap-2 rounded-2xl border border-accent-soft bg-accent-soft p-5">
            <p class="text-[0.6875rem] font-bold tracking-[0.1em] text-muted">現在的狀態</p>
            <strong class="font-display text-xl font-semibold tracking-[-0.03em]">Google 登入預覽</strong>
            <p class="text-[0.875rem] leading-relaxed text-muted">出勤資料模型與帳號管理功能仍在後續 MVP 切片中。</p>
            <RouterLink class="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:-translate-y-px hover:text-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" to="/support">需要協助？前往支援頁 <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </aside>
      </div>
    </main>

    <footer class="mx-auto flex w-full max-w-[76rem] flex-wrap items-center justify-between gap-4 border-t border-line pt-4 text-[0.8125rem] text-muted">
      <span>只處理完成當下任務所需的資料。</span>
      <RouterLink class="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:-translate-y-px hover:text-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" to="/login">回到登入頁 <span aria-hidden="true">↗</span></RouterLink>
    </footer>
  </div>
</template>
