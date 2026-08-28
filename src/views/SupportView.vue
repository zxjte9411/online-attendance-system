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
      <span class="info-header-label">協助與回報</span>
    </header>

    <main id="info-main" class="info-layout">
      <section class="info-hero" aria-labelledby="support-title">
        <p class="info-eyebrow"><span class="info-eyebrow-line" aria-hidden="true"></span>支援</p>
        <h1 id="support-title">遇到問題，先找到最短的下一步。</h1>
        <p class="info-lead">目前是 Google 登入預覽版本。如果畫面和預期不同，請把你看到的訊息與操作步驟寄來，我們會依目前開放的範圍回覆。</p>
        <a class="support-email" href="mailto:a5852241@gmail.com">寄信給支援 <span aria-hidden="true">↗</span></a>
      </section>

      <div class="info-body">
        <article class="info-content">
          <section class="info-section" aria-labelledby="support-login-title">
            <p class="info-section-label">01 / 登入問題</p>
            <h2 id="support-login-title">Google 登入沒有完成</h2>
            <ol class="info-list info-list-ordered">
              <li>確認瀏覽器允許開啟 Google 登入頁，並重新從登入頁開始。</li>
              <li>如果回到本服務後看到錯誤訊息，請記下訊息內容，不要反覆送出敏感資訊。</li>
              <li>仍無法完成時，寄信告訴我們使用的裝置、瀏覽器與發生步驟。</li>
            </ol>
          </section>

          <section class="info-section" aria-labelledby="support-preview-title">
            <p class="info-section-label">02 / 預覽範圍</p>
            <h2 id="support-preview-title">有些入口目前只呈現介面</h2>
            <p>預覽環境可能尚未開放 Google 登入。當 Supabase 公開設定不存在時，登入頁會明確顯示「Google 登入尚未開放」，不會提供可操作的登入按鈕。</p>
            <p>登入本身也不會建立或修改出勤資料；相關資料功能會在後續版本逐步開放。</p>
          </section>

          <section class="info-section" aria-labelledby="support-delete-title">
            <p class="info-section-label">03 / 帳號資料</p>
            <h2 id="support-delete-title">帳號刪除目前尚未提供</h2>
            <div class="info-callout">
              <strong>這不是已上線的自助服務。</strong>
              <p>帳號資料刪除屬於後續 MVP 資料模型切片，必須先定義資料範圍與關聯紀錄後才會實作。若要回報這項需求，請寄信說明；我們會回覆目前能處理的範圍，不會把規劃中的功能當成現有功能。</p>
            </div>
          </section>

          <section class="info-section" aria-labelledby="support-contact-title">
            <p class="info-section-label">04 / 聯絡我們</p>
            <h2 id="support-contact-title">一封信，帶上這些資訊就夠了</h2>
            <p>請提供問題發生的頁面、看到的錯誤文字，以及重現步驟。若方便，也可以附上瀏覽器與裝置名稱；請不要寄送密碼、驗證碼或 OAuth token。</p>
            <a class="info-text-link info-contact-link" href="mailto:a5852241@gmail.com">a5852241@gmail.com <span aria-hidden="true">↗</span></a>
          </section>
        </article>

        <aside class="info-aside" aria-label="支援頁快速資訊">
          <div class="info-aside-card">
            <p class="info-aside-label">回報前</p>
            <strong>不用先整理成報告</strong>
            <p>一段錯誤訊息，加上你做了什麼，就能幫助我們定位問題。</p>
            <RouterLink class="info-text-link" to="/login">回到登入頁 <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </aside>
      </div>
    </main>

    <footer class="info-footer">
      <span>把問題說清楚，下一步就會更簡單。</span>
      <RouterLink class="info-text-link" to="/login">回到登入頁 <span aria-hidden="true">↗</span></RouterLink>
    </footer>
  </div>
</template>
