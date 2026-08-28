# 線上出勤時數表部署安全設定

## Cloudflare Pages

- Production branch 使用 `master`，建置命令使用 `bun run build`，輸出目錄為 `dist`。
- 只在 Production environment 設定 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`；兩者皆使用 Supabase 正式專案值。
- 可開啟 PR preview 供檢視，但 Preview environment **不可設定** `VITE_SUPABASE_URL` 或 `VITE_SUPABASE_ANON_KEY`，也不可為 preview 放寬 Supabase callback allowlist。
- 尚未取得 Cloudflare credentials 前，不新增 GitHub deployment workflow；部署以 Cloudflare Pages 手動設定為準。

## DNS

- Cloudflare Pages production custom domain 使用 `attendance.nhb.pp.ua`，依 Pages 顯示的目標建立對應 DNS record。
- **不可修改 `nhb.pp.ua` 既有 VM mapping**，也不可將 root domain 或既有 VM record 改指向 Cloudflare Pages。

## Supabase Auth

- Authentication 的 Site URL 設為 `https://attendance.nhb.pp.ua`。
- Redirect URL allowlist 只保留 `https://attendance.nhb.pp.ua/auth/callback`；移除 localhost、preview 及其他寬鬆規則。
- Google provider 的 client ID/secret 以正式專案設定為準，不把 secret 寫入 repository。

## Google OAuth

- Google Cloud OAuth client 的 Authorized JavaScript origins 設為 `https://attendance.nhb.pp.ua`。
- Authorized redirect URI 使用 Supabase 專案的正式 callback：`https://<project-ref>.supabase.co/auth/v1/callback`。
- 不加入 PR preview origin 或 callback；變更正式網域時同步檢查 Cloudflare、Supabase 與 Google 三處設定。

## 部署後驗證清單

- [ ] Production DNS 與 HTTPS 正常，且 `nhb.pp.ua` VM mapping 未被修改。
- [ ] 未登入可直接開啟 `/privacy` 與 `/support`，不會被導向登入頁。
- [ ] 未登入進入 `/`、`/attendance`、`/leave`、`/reports`、`/settings` 會導向登入，並保留 redirect。
- [ ] Production 的 Google 登入可完成 callback，且登入後回到原請求頁面。
- [ ] Supabase redirect allowlist 僅有 production callback，沒有 localhost 或 preview URL。
- [ ] PR preview 可載入靜態內容，但未注入 `VITE_SUPABASE_*`，不以 preview 驗證正式登入流程。
