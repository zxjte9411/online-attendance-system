# 線上出勤時數表

個人使用的出勤記錄系統，以每日一筆出勤與可追溯的工時計算為核心。

## 技術堆疊與工作流

- **前端**：Vue 3、TypeScript、Vite、Vue Router、Vitest
- **套件管理與執行工具**：Bun（唯一依賴鎖定檔為 `bun.lock`）
- **認證與後端平台**：Supabase（Auth、PostgreSQL、Storage、RLS）
- **託管平台**：Cloudflare Pages（生產網址：`https://attendance.nhb.pp.ua`）

### 本機開發與驗證

```sh
# 安裝相依套件
bun install --frozen-lockfile

# 啟動本機開發伺服器（預設 http://localhost:5173）
bun run dev

# 執行單一完整驗證 Seam（包含型別檢查、單元測試、生產建置）
bun run verify
```

### 開發容器中的 Local Supabase

Supabase CLI 在開發容器中執行、Docker 服務位於遠端主機時，CLI 的預設 `127.0.0.1` 無法連線。以 `host.docker.internal` 覆寫服務主機：

```sh
SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase start
SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase db reset
SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase stop
```

- Edge Function `sync-dgpa-calendar` 用於同步行政院人事行政總處（DGPA）辦公日曆。在開發容器中啟動時，若 Docker 主機路徑與容器路徑不同，可指定主機路徑啟動：`SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase --workdir <主機專案路徑> start`。
- 資料庫測試優先使用 `supabase test db`。若 Docker credential helper 無法拉取 `pg_prove` 映像，保留錯誤輸出，並以本機資料庫容器執行已提交的 pgTAP SQL 作為 fallback：`docker exec -i supabase_db_online-attendance-system psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/<test-file>.sql`。
- 此流程只操作 Local Supabase；勿把 `.env.local` 的值貼入文件、提交，或套用到 Dev／Production 專案。

### DGPA 辦公日曆同步驗證 Seam

專案將 DGPA 辦公日曆同步的驗證清楚切分為兩種不同職責的 Seam：

1. **確定性本地 Smoke 測試（Merge-blocking CI 閘門）**：
   - 執行命令：`./scripts/smoke-edge-function.sh`
   - 目的：在 CI 與本地啟動本機 Edge Runtime，使用獨立的本機 Fixture 伺服器提供 2026（UTF-8）與 2025（Big5）全年度完整測試資料，驗證未授權 401、參數錯誤 400、下載解碼、全年度 365 筆校驗與寫入 `dgpa_calendar_cache`。
   - 隔離保證：透過 Edge Runtime 環境變數 `DGPA_METADATA_URL` 指向本機 fixture 伺服器，嚴格阻絕任何對外部 `data.gov.tw` 的連線，不受外部網路或政府機關服務中斷影響。
2. **真實 Upstream 存活與漂移探針（Non-blocking 定期／手動檢查）**：
   - 執行命令：`./scripts/verify-live-dgpa.sh [YEAR]`（預設當前年份）
   - GitHub Actions 工作流：`.github/workflows/dgpa-live-verification.yml`（每日 04:00 UTC 定時執行，並支援 `workflow_dispatch` 手動觸發）。
   - 目的：直接連線政府資料開放平台真實 API，檢驗 upstream metadata 結構、資源候選下載、編碼解碼與欄位規格，能明確辨識「外部服務異常／合約漂移」與「本機應用程式回歸」。此工作流**不阻擋** PR merge。

## 環境與設定責任

專案清晰區分四種環境的責任邊界，避免本機 CLI 設定與雲端專案設定混淆：

| 環境 | 角色與用途 | 設定來源與權限 |
| --- | --- | --- |
| **Local Supabase** | 本機開發與 Migration 工作流。 | 由 Supabase CLI 讀取 `supabase/config.toml`。Site URL 設為 `http://localhost:5173`，允許本機 callback 重導。 |
| **Dev Supabase** | 遠端真實整合與 Google OAuth 測試。 | 位於 Supabase Cloud 新加坡 Dev 專案控制台手動設定，不將 Secret 寫入版本庫。 |
| **Production Supabase** | 正式生產環境資料與認證後端。 | 位於 Supabase Cloud 新加坡 Production 專案控制台。Site URL 設為 `https://attendance.nhb.pp.ua`，Redirect allowlist 僅允許正式 callback。 |
| **Cloudflare Pages Preview** | PR 預覽建置，供介面與版面審查。 | 不注入 `VITE_SUPABASE_*` 環境變數，不擴張正式 OAuth callback allowlist。登入頁安全呈現預覽狀態。 |

## 外部雲端服務設定指引

### Cloudflare Pages

- Production branch 使用 `master`，建置命令為 `bun run build`，輸出目錄為 `dist`。
- SPA Deep Link 重導已由 `public/_redirects`（`/* /index.html 200`）處理。
- 只在 Production environment 設定公開變數 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。
- PR preview 保持未注入 Supabase 金鑰狀態，不為 preview 擴張 OAuth allowlist。
- 尚未取得 Cloudflare credentials 前，不新增 GitHub deployment workflow，部署以 Cloudflare Pages 控制台為準。

### DNS

- Cloudflare Pages production custom domain 使用 `attendance.nhb.pp.ua`。
- **不可修改 `nhb.pp.ua` 既有 VM mapping**，亦不可將 root domain 或既有 VM record 指向 Cloudflare Pages。

### Supabase Auth（正式專案控制台）

- Authentication Site URL 設為 `https://attendance.nhb.pp.ua`。
- Redirect URL allowlist 僅設定 `https://attendance.nhb.pp.ua/auth/callback`；移除 localhost、preview 及寬鬆萬用字元規則。
- Google provider Client ID / Secret 由 Google Cloud Console 取得並在 Supabase 控制台設定，嚴禁寫入 Git 或前端環境變數。

### Google Cloud OAuth Client（正式設定）

- Authorized JavaScript origins 設為 `https://attendance.nhb.pp.ua`。
- Authorized redirect URI 使用 Supabase 正式專案 callback：`https://<project-ref>.supabase.co/auth/v1/callback`。
- 不加入 PR preview origin 或 callback；網域變更時同步檢查 Cloudflare、Supabase 與 Google 三處。

## 部署後驗證清單

- [ ] Production DNS 與 HTTPS 正常，且 `nhb.pp.ua` VM mapping 未被修改。
- [ ] 未登入可直接開啟 `/privacy` 與 `/support`，不會被導向登入頁。
- [ ] 未登入進入 `/`、`/attendance`、`/leave`、`/reports`、`/settings` 會導向登入頁並保留 safe redirect query。
- [ ] Production 的 Google 登入可完成 PKCE callback，且登入後安全回到原請求頁面。
- [ ] Supabase redirect allowlist 僅有 production callback，沒有 localhost 或 preview URL。
- [ ] PR preview 可正常載入靜態頁面與 SPA 介面，但未注入 `VITE_SUPABASE_*`，登入頁明確呈現預覽狀態。
