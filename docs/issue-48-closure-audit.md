# Issue #48 最終 Regression 與 Closure Audit 報告

本報告為 **[Issue #48](https://github.com/zxjte9411/online-attendance-system/issues/48)**（重構 Account Ready、Work Assignment 與 Work Policy 生命週期）的最終 closure audit 依據，由 **[Issue #69](https://github.com/zxjte9411/online-attendance-system/issues/69)** 驗證並記錄。

---

## 1. 權威規格與前置狀態

- **權威依據**：以根目錄 [`CONTEXT.md`](../CONTEXT.md) 與 Issue #48 acceptance criteria 為唯一權威合約。
- **前置依賴驗證**：
  - [#67](https://github.com/zxjte9411/online-attendance-system/issues/67)（Calendar 嚴格隔離 legacy Work Policy）：已由 PR #70 合併入 `master`。
  - [#68](https://github.com/zxjte9411/online-attendance-system/issues/68)（統一 #48 canonical 規格並清除殘留 legacy contract）：已由 PR #71 合併入 `master`。
- **Audit 原則**：不改動已驗證的產品行為，不建立重疊的第二套驗證架構，以 repository 現有最高層驗證 seam 與已建立之測試套件作為權威證據。

---

## 2. #48 主要 Domain 面向查核與證據

### 2.1 Account Ready / Auth 分離
- **規範要求**：Account Ready 僅由現行 canonical profile readiness（`display_name` 非空白）決定；terminal auth invalid 與 transient/UNKNOWN auth failure 維持分離，後者不得被當作 setup redirect 或強制 logout。
- **實作與驗證證據**：
  - `src/router.ts`（L181–221）：
    - `isLoggedIn` 時透過 `isTerminalAuthError` 判斷錯誤類型；遇到 `session_not_found`、`user_not_found`、`session_expired`、`bad_jwt` 等終端失效時呼叫 `signOutAndLogin()`。
    - 暫時性網路錯誤或伺服器異常導向 `account-unavailable`，絕不強制登出或導向 `setup`。
    - 登入使用者進入受保護路由時檢查 `profile?.display_name?.trim()`；只有空白或未就緒者導向 `setup`。
  - `src/App.spec.ts`（25 tests 全部通過）：
    - `本機 session 的 user 已不存在時清除本機 session 並回登入`（L90）。
    - `getSession 回傳 session_expired 時清除本機 session 並回登入`（L104）。
    - `getSession 暫時失敗時保留目的地並進入帳號狀態頁`（L118）。
    - `Auth server 暫時失敗時保留本機 session 並導向帳號狀態頁`（L134）。
    - `Auth 暫時失敗時保留目的地，恢復後重試可回到原路由`（L180）。
    - `UNKNOWN 重試時遇到 terminal Auth error，登入 redirect 回原目的地`（L200）。
    - `Profile 缺失時導向設定，但不要求工作情境或制度完整`（L219）。
    - `Profile 顯示名稱只有空白時導向設定`（L230）。
    - `Profile Ready 時不因工作情境或制度未完成而阻擋受保護路由`（L242）。
    - `Profile 讀取失敗時導向帳號狀態頁，該頁仍會驗證 session 但不重複讀 Profile`（L255）。

### 2.2 Work Assignment 生命週期
- **規範要求**：支援 future / current / ended、gap、open-ended 期間，且同使用者日期區間不重疊；已使用 Assignment 的 identity / period invariant 維持。
- **實作與驗證證據**：
  - 資料庫 Invariants (`supabase/tests/issue_50_work_assignments_test.sql`，50/50 tests 通過）：
    - `work_assignments` 表格具備排他性約束條件（exclusion constraint），同使用者區間重疊或重疊於 open-ended 區間均被資料庫層級拒絕（ok 26, ok 27）。
    - 支援相鄰連續起訖日（ok 22）、期間存在 gap（ok 23）、未來派駐（ok 24）與 open-ended 派駐（ok 25）。
    - 同一 H/A/P 無中斷續約自動展延 `effective_to` 不產生重複紀錄（ok 30–32）；有中斷則建立新派駐（ok 33）。
    - 已有出勤紀錄時，嚴格禁止修改 `staffing_employer`、`client_company`、`project` 識別欄位（ok 36–39）。
    - 縮小派駐期間若排除既有 policy 或 attendance work_date 時嚴格拒絕（ok 40–43）；安全擴展派駐期間允許（ok 45–46）。
  - 前端與 Domain (`src/domain/work-assignment/work-assignment.spec.ts`，14 tests 全部通過；`src/lib/work-assignment.spec.ts`，4 tests 全部通過）：
    - `getWorkAssignmentStatus` 依台北日期正確推導 `FUTURE`（尚未生效）、`CURRENT`（目前派駐）、`ENDED`（已結束）。
    - `formatWorkAssignmentPeriod` 對 open-ended 派駐在 CURRENT 時顯示 `至今`，在 FUTURE 時顯示 `未定`。
    - `validateWorkAssignmentInput` 於前端即時阻擋重疊與已有出勤之 H/A/P 變更。

### 2.3 Work Policy 隸屬與 Gap 容許
- **規範要求**：Work Policy 嚴格隸屬 Work Assignment；policy gap 是合法狀態；used Policy 的 immutable fields 與 effective date 保護維持。
- **實作與驗證證據**：
  - 資料庫 Invariants (`supabase/tests/issue_51_work_policy_test.sql`，77/77 tests 通過）：
    - Policy 必須隸屬於 `assignment_id`（ok 6）；排他性約束條件嚴格依 assignment 判定無重疊（ok 24）。
    - Policy 起訖日期必須完全落在所屬 Assignment 期間內（ok 60–63, throws on out-of-range）。
    - 容許派駐期間內存在 Policy Gap（past/current/future 間隔合法，ok 44–45）。
    - 已有出勤紀錄引用之 Policy 欄位（工時、起訖、計算規則等）受到不可變保護（ok 64–72）。
  - Domain 與 UI (`src/settings-regression.spec.ts`，5 tests 全部通過；`src/views/SettingsView.spec.ts`，12 tests 全部通過）：
    - 依據 Asia/Taipei 今日日期正確顯示「尚未生效」、「目前適用」、「已結束」。
    - 已被出勤引用之制度於 UI 鎖定不可變欄位。

### 2.4 Today 出勤與 Snapshot 呈現
- **規範要求**：Today 只能在 Attendance Ready(today) 時建立新打卡；無 Assignment / Policy 是正常 unavailable 狀態，而非頁面存取錯誤；已存在紀錄繼續依保存 snapshot 呈現不被改寫。
- **實作與驗證證據**：
  - 資料庫 Invariants (`supabase/tests/issue_52_attendance_ready_test.sql`，29/29 tests 通過）：
    - 打卡 RPC 在缺派駐或缺制度時回傳可辨識狀態而非資料庫 crash。
    - 既有打卡即使當前配置改變，仍可依 snapshot 完成下班打卡（ok 26–27）。
    - 下班打卡不推論或補填 legacy attendance 的 `assignment_id`（ok 28–29）。
  - UI 整合 (`src/views/TodayView.spec.ts`，14 tests 全部通過）：
    - 無今日 Assignment 時呈現 `unavailable-no-assignment` 狀態並提供前往設定連結，非頁面錯誤（L140–155）。
    - 有 Assignment 但缺 Policy 時呈現 `unavailable-missing-policy` 狀態並帶參數導向設定，非頁面錯誤（L157–171）。
    - 已有紀錄但目前無 Policy 時，依保存快照完整呈現歷史制度與已上班/已完成狀態（L115–138）。

### 2.5 歷史手動補登與編輯（Manual Historical Edit）
- **規範要求**：可對 ended Assignment 的有效日期操作，且仍依 target date -> Assignment -> Policy 解析。
- **實作與驗證證據**：
  - 資料庫 Invariants (`supabase/tests/issue_53_target_date_attendance_test.sql`，55/55 tests 通過）：
    - `create_manual_attendance(date, time, time, text)` 與 `edit_attendance_record(id, time, time, text)` 簽章均已移除 `context_id` 參數（ok 7–40）。
    - 兩者皆以 `resolve_work_assignment_policy(target_date)` 統一解析派駐與制度（ok 52–60）。
    - 針對已結束之 Assignment，歷史日期仍可精確解析該區間之 Assignment 與 Policy 並完成補登與編輯。
  - 前端 UI (`src/views/AttendanceView.spec.ts`，13 tests 全部通過）：
    - 手動補登對話框不含工作情境選單（L358, L390）。

### 2.6 Calendar / Special Status / DGPA
- **規範要求**：Calendar classification、Special Status、DGPA/manual override 不依賴 Assignment / Policy；Profile-only 使用者仍可正常使用相關日期分類。
- **實作與驗證證據**：
  - 資料庫 Invariants (`supabase/tests/issue_20_day_status_calendar_overrides_test.sql`，58/58 tests 通過；`supabase/tests/issue_21_dgpa_calendar_cache_test.sql`，29/29 tests 通過）：
    - `day_statuses`（LEAVE/REMOTE/BUSINESS_TRIP）與 `calendar_overrides`（WORKDAY/HOLIDAY）獨立於派駐與出勤紀錄存在。
  - Domain Resolver (`src/domain/dgpa-calendar/resolver.spec.ts`，25 tests 全部通過）：
    - Manual Override > DGPA > Work Policy > Weekend Fallback 判定層次嚴格維持。
    - 無 Work Policy 與 DGPA 時正常 fallback 至週末規則（L183–201）。
  - UI 整合 (`src/views/LeaveView.spec.ts`，35 tests 全部通過）：
    - 帳號就緒之 Profile-only 使用者無須任何派駐即可檢視行事曆、標註特殊狀態與設定手動覆寫。

### 2.7 Legacy Policy 隔離
- **規範要求**：指定 Work Assignment 時 legacy `assignment_id = null` Work Policy 不得參與 canonical Calendar / Report resolution。
- **實作與驗證證據**：
  - Calendar Resolver (`src/domain/dgpa-calendar/resolver.spec.ts`，L506–549）：
    - 在多派駐與 legacy policy 同存時，嚴格依 `assignment_id` 隔離（L506–527）。
    - 當 Assignment 期間內出現 Policy Gap 時，解析結果為 `null`，絕不 fallback 至 legacy policy（L529–548）。
  - Monthly Report (`src/domain/report/monthly-report.spec.ts`，L629–674）：
    - 只有 legacy policy 時維持 MISSING_POLICY 語意與 configuration error，不自動取用（L654–663）。
    - Canonical 與 legacy 同存時只解析 canonical policy，不引發 multiple-policy 衝突（L664–673）。

### 2.8 Report Scoping 與 Export 阻擋
- **規範要求**：Report 以 Assignment 為 scope；Assignment period 外日期為 Report N/A 且不計入 scheduled / absence / missing-policy；只有 Assignment 期間內真正的 Policy gap 才阻擋 export。
- **實作與驗證證據**：
  - Domain Report (`src/domain/report/monthly-report.spec.ts`，28 tests 全部通過）：
    - 派駐起日前的日期標為 `in_assignment_period: false`，`scheduled_minutes = 0`，`absence_minutes = 0`（L457–486）。
    - 派駐迄日後的日期標為 `in_assignment_period: false`，`scheduled_minutes = 0`，`absence_minutes = 0`（L488–520）。
    - 只有派駐期間內真正為工作日且無制度之日期才計入 `missingPolicyDates` 並標註 `hasConfigurationError: true`（L522–560）。
  - 匯出阻擋與 UI (`src/domain/report/csv-export.spec.ts`，L347；`src/domain/export-template/xlsx-export.spec.ts`，L782；`src/views/ReportView.vue`，L357–368）：
    - `hasConfigurationError` 為 true 時，CSV 與 XLSX 匯出函式均拋出錯誤阻擋，UI 按鈕亦同步 disabled。

### 2.9 Export Template Ownership
- **規範要求**：Export Template ownership 為 Work Assignment；legacy context-only template 僅保留必要歷史可讀性，不形成新的 canonical write/update path。
- **實作與驗證證據**：
  - 資料庫 Invariants (`supabase/tests/issue_55_export_templates_assignment_owner_test.sql`，22/22 tests 通過；`supabase/tests/issue_56_cleanup_legacy_work_context_test.sql`，35/35 tests 通過）：
    - `export_templates.assignment_id` 具備外鍵與非空檢查（ok 9, ok 24, ok 34）。
    - authenticated 使用者禁止新增 context-only template（ok 144–148, throws_ok）。
    - 歷史 context-only template 僅可 SELECT 讀取，UPDATE 與 DELETE 均被 RLS 與 Trigger 嚴格封鎖（ok 158–187, ok 192–206）。
    - 歷史範本資料未被啟發式遷移或竄改（ok 254–273）。
  - UI 整合 (`src/components/settings/ExportTemplateSection.spec.ts`，17 tests 全部通過）：
    - 範本管理與預覽均明確綁定所選派駐。

### 2.10 Write Contract 脫鉤
- **規範要求**：新 write / recalculation path 不再依賴 Work Context、active/default context 或 global setup-complete gate。
- **實作與驗證證據**：
  - `src/lib/settings.ts`：`WorkPolicyInput` 明確 omit `context_id`，不傳入情境識別。
  - `src/lib/work-assignment.ts`：`WorkAssignmentInput` 為獨立 canonical 模型，無任何 context 欄位。
  - `supabase/migrations/20260905010000_issue_56_cleanup_legacy_work_context.sql`：已移除 `create_work_context`、`activate_work_context`、`set_default_work_context` 等所有 RPC。

### 2.11 Repository Canonical Docs
- **規範要求**：repository canonical docs 與現行實作一致；殘留 Work Context / active / is_default 命中都能被歸類為 migration、歷史 archival/read compatibility 或明確 superseded 文件。
- **實作與驗證證據**：
  - 根目錄 [`CONTEXT.md`](../CONTEXT.md) 與 `docs/agents/domain.md` 正式確立為唯一 canonical authority。
  - 歷史 PRD（`docs/online-attendance-system-PRD.md`、`PRD1.md`、`PRD2.md`）與交接文件頂部均已標註 `Historical / Superseded` 警語。

---

## 3. 驗證命令與執行結果

| 驗證項目 | 執行命令 | 結果 | 測試數 / 摘要 |
| :--- | :--- | :---: | :--- |
| **App Verification Seam** | `bun run verify` | **PASS** | 56 test files, 884 tests 全部通過；`vue-tsc` 零錯誤；Vite 生產建置打包成功。 |
| **Local Supabase Reset** | `SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase db reset` | **PASS** | 15 個 migration 全部依序乾淨套用完成。 |
| **資料庫 pgTAP 測試** | `docker exec -i supabase_db_online-attendance-system psql -v ON_ERROR_STOP=1 -U postgres -d postgres < <file>` | **PASS** | 13 個測試檔案共 **578** 項斷言全部通過（0 failure）。<br>*(註：`supabase test db` 因開發容器跨 Docker host 無法掛載 `/workspaces` 路徑產生 exit 2，依 `README.md` 既定 fallback 執行本機容器測試)* |
| **出勤並行隔離回歸** | `./scripts/test-issue-62-attendance-concurrency.sh` | **PASS** | 並行更新 Assignment 與 Policy 均正確回傳 SQLSTATE `55P03`，出勤 snapshot 寫入完整性無損。 |
| **Local DB Advisors** | `SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase db advisors --local --type all` | **PASS** | `No issues found` (`results: []`)；security 與 performance 亦皆為 0 issues。 |
| **Local DB Lint** | `SUPABASE_SERVICES_HOSTNAME=host.docker.internal supabase db lint --local --schema public --level error` | **PASS** | `public` schema 檢查結果為 0 errors (`results: []`)。 |

---

## 4. 殘留 Legacy 術語分類清冊

對全儲存庫進行搜尋，所有 `Work Context`、`work_contexts`、`context_id`、`active`、`is_default` 均已完成歸類：

1. **不可變歷史 Migration（Archival / Immutable Migration History）**：
   - 包含 `20260829065229_issue_17_work_context_policy.sql`、`20260829154308_issue_18_attendance_records.sql`、`20260830020000_issue_19_attendance_manual_edit.sql`、`20260830050000_issue_23_export_templates.sql`、`20260902033715_issue_52_attendance_ready.sql`、`20260902071913_issue_53_target_date_attendance.sql`。
   - 屬性：記錄資料庫歷程演進；其活性欄位已於 migration `20260905010000_issue_56_cleanup_legacy_work_context.sql` 正式 drop。
2. **資料庫歷史唯讀相容性測試（Database Read-only Compatibility & Constraint Invariant Tests）**：
   - 包含 `supabase/tests/issue_17_*.sql`、`issue_23_*.sql`、`issue_51_*.sql`、`issue_53_*.sql`、`issue_55_*.sql`、`issue_56_*.sql`。
   - 屬性：驗證歷史 `work_contexts` 唯讀、停用寫入權限，以及歷史 context-only 範本的防竄改保護。
3. **前端/報表歷史唯讀欄位投影（Read-only Historical Schema Projection）**：
   - `src/lib/settings.ts`、`src/lib/attendance.ts`、`src/domain/report/monthly-report.ts` 中之 `context_id` 與 `attendance_context_id` 僅供讀取歷史 attendance/policy 快照，所有寫入型別（如 `WorkPolicyInput`）均已排除。
4. **明確 Superseded 之歷史文件（Historical Documentation）**：
   - `docs/online-attendance-system-PRD.md`、`PRD1.md`、`PRD2.md`、`docs/handoff/online-attendance-pr33-handoff.md`。
   - 屬性：文件頂部均有 `[!WARNING] 文件狀態：Historical / Superseded` 明確警語。
5. **非 Domain 詞彙（CSS / UI Component State / Test Descriptions）**：
   - `active` 出現於 CSS pseudo-class（`:active`、`forced-colors: active`）、Vue UI ref（`activePreviewWorksheets`、`activeSelectionTarget`）及測試敘述（`resolves active assignment`），與已被淘汰之工作情境狀態無涉。

---

## 5. Audit 結論與交付證明

- **Issue 查核結論**：依據全域測試與合約查核，**Issue #48 之所有切片與 acceptance criteria 已完整達成**。系統已成功統一為單一且嚴謹之 Account Ready / Work Assignment / Work Policy / Attendance / Calendar / Report 模型，建議由 maintainer 執行最後 acceptance check 並正式關閉 Issue #48。
- **Delivery Artifacts**：
  - Originating Issue：[#69](https://github.com/zxjte9411/online-attendance-system/issues/69)
  - Parent Issue：[#48](https://github.com/zxjte9411/online-attendance-system/issues/48)
  - Dedicated Branch：`issue-69-closure-audit`
  - Target Base Branch：`master`
