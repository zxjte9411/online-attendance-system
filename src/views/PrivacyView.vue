<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="info-page">
    <a class="skip-link" href="#info-main">跳至主要內容</a>

    <header class="info-header">
      <RouterLink class="wordmark" to="/login" aria-label="回到線上出勤登入頁">
        <span class="wordmark-mark" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </RouterLink>
      <span class="info-header-label">資料與使用說明</span>
    </header>

    <main id="info-main" class="info-layout">
      <section class="info-hero" aria-labelledby="privacy-title">
        <p class="info-eyebrow"><span class="info-eyebrow-line" aria-hidden="true"></span>隱私權</p>
        <h1 id="privacy-title">先說清楚，你的帳號資料會去哪裡。</h1>
        <p class="info-lead">這份說明對應目前的 Google 登入預覽版本。只說明現在已經存在的處理方式，不把未完成的功能寫成承諾。</p>
        <p class="info-meta">最後更新：2026 年 8 月 28 日</p>
      </section>

      <div class="info-body">
        <article class="info-content">
          <section class="info-section" aria-labelledby="privacy-data-title">
            <p class="info-section-label">01 / 目前會處理什麼</p>
            <h2 id="privacy-data-title">Google 登入只用來確認你是誰</h2>
            <p>登入時，你會被帶往 Google 完成身分驗證。系統透過 Supabase Auth 接收 Google 登入所需的帳號識別資料，例如電子郵件地址、顯示名稱、頭像或 Google 提供的識別資訊；實際欄位依 Google 與 Supabase 的回傳內容而定。</p>
            <p>這些資料目前用於建立與維持登入工作階段，以及判斷你是否能進入需要登入的頁面。我們不會在登入時要求你填寫額外的個人資料。</p>
          </section>

          <section class="info-section" aria-labelledby="privacy-purpose-title">
            <p class="info-section-label">02 / 使用目的</p>
            <h2 id="privacy-purpose-title">不為登入以外的事情多拿資料</h2>
            <ul class="info-list">
              <li>確認帳號身分，讓你可以登入線上出勤。</li>
              <li>維持登入狀態，並把登入後的頁面存取限制在已驗證的帳號。</li>
              <li>目前的登入流程不會建立或修改出勤資料，也沒有在這個流程中加入廣告或行銷用途。</li>
            </ul>
          </section>

          <section class="info-section" aria-labelledby="privacy-service-title">
            <p class="info-section-label">03 / 服務提供者</p>
            <h2 id="privacy-service-title">Google 與 Supabase 各自負責一段流程</h2>
            <p>Google 負責身分驗證；Supabase Auth 負責傳遞 OAuth 結果並管理本服務的登入工作階段。這表示登入時會依照這兩項服務各自的隱私權政策與設定處理資料。</p>
            <p>登入工作階段的保存方式與期限，會受到 Supabase 專案設定及瀏覽器狀態影響。本頁不宣稱超出目前程式實際提供的保存或管理功能。</p>
          </section>

          <section class="info-section" aria-labelledby="privacy-delete-title">
            <p class="info-section-label">04 / 帳號資料刪除</p>
            <h2 id="privacy-delete-title">刪除功能還不是現在提供的功能</h2>
            <div class="info-callout">
              <strong>目前沒有自助刪除帳號或帳號資料的操作入口。</strong>
              <p>帳號資料刪除會放在後續的 MVP 資料模型切片中，待資料範圍、關聯紀錄與刪除規則完成後再實作。這是後續規劃，不是目前已提供的功能。</p>
            </div>
          </section>
        </article>

        <aside class="info-aside" aria-label="隱私權說明導覽">
          <div class="info-aside-card">
            <p class="info-aside-label">現在的狀態</p>
            <strong>Google 登入預覽</strong>
            <p>出勤資料模型與帳號管理功能仍在後續 MVP 切片中。</p>
            <RouterLink class="info-text-link" to="/support">需要協助？前往支援頁 <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </aside>
      </div>
    </main>

    <footer class="info-footer">
      <span>只處理完成當下任務所需的資料。</span>
      <RouterLink class="info-text-link" to="/login">回到登入頁 <span aria-hidden="true">↗</span></RouterLink>
    </footer>
  </div>
</template>
