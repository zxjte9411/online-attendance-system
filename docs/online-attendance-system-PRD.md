# 線上出勤時數表產品需求文件（PRD）

## 1. 文件目的與產品定位

本 PRD 是線上出勤時數表唯一的實作、範圍與驗收依據。產品以「個人每天快速完成出勤紀錄，月底能直接產出可用報表」為核心，不以人資管理或多人協作為目標。

### 1.1 產品目標

1. 以單一個人帳號保存每日出勤資料。
2. 保留公司與專案識別，讓不同工作情境能套用不同工作制度與匯出範本；但不建立公司成員、主管或協作功能。
3. 保存實際打卡時間，並以工作制度衍生有效時間、預計下班時間及工時統計。
4. 取代每日手填及月底手動回填 Excel 的流程。
5. 讓使用者能修正單日紀錄、標註特殊狀態，並保留足以解釋結果的歷史快照。

### 1.2 成功指標

- 使用者能在今日頁完成上班、下班打卡，且不會因單純開啟頁面而自動寫入。
- 月列表能清楚呈現實際時間、計算時間、狀態與統計數字。
- CSV 可直接以 Microsoft Excel 開啟中文內容；每個工作情境的一份多月份 XLSX 範本能依 Mapping 填入選定月份資料。
- 使用者只能讀取、修改及刪除自己的資料。

## 2. 名詞與範圍定義

| 名詞 | 定義 |
|---|---|
| 個人帳號 | 由 Supabase Auth 驗證的單一使用者帳號；本產品不承諾特定身分提供者。V1 不提供團隊成員、主管或多租戶權限。 |
| Company / Project | 工作情境識別。保存公司識別與專案識別，供工作制度、出勤紀錄與範本歸類；不是權限邊界。 |
| Work Policy（工作制度） | 某個工作情境在一段期間適用的上班、工時、固定休息及時間計算規則。 |
| 實際時間 | 使用者按下打卡或在補登表單輸入的原始上、下班時間，不可被有效時間覆蓋；CLOCK 由 server／DB 時間保存，MANUAL 由使用者輸入。 |
| 實際經過分鐘數 | `actual_elapsed_minutes`：同一工作日內，實際下班減實際上班的分鐘數；任一實際時間缺漏時為未完成，不產生此結果。 |
| 有效時間 | 套用當日工作制度後，用於工時計算的衍生時間，包含 `effective_clock_in_at` 與 `effective_clock_out_at`。 |
| 有效下班時間 | `effective_clock_out_at`：由 `actual_clock_out_at` 依 `clock_out_rounding_mode` 與分鐘數衍生；模式預設為 `NONE`，模式為 `NONE` 時等於實際下班。未設定時不得靜默套用其他模式。 |
| 預計下班 | 依有效上班時間、每日工作分鐘數及固定休息分鐘數推算的提示，不代表實際下班。 |
| 日曆 | 用來判斷工作日、週末、假日或補班日的資料；包含 DGPA 辦公日曆快取及使用者人工覆寫。 |
| 特殊狀態 | `LEAVE`、`REMOTE`、`BUSINESS_TRIP` 三種單日狀態，均可附備註。 |
| 建立來源 | `created_source`：`CLOCK` 表示即時打卡建立；`MANUAL` 表示人工補登建立。建立來源不因後續修正而改寫。 |
| 人工修正 | `manually_adjusted` 僅表示既有紀錄建立後曾被人工修改；`last_manual_edit_at` 保存最近一次人工修改時間。MANUAL 建立本身仍以 `created_source = MANUAL` 表示。 |
| Calculation Version | `calculation_version`：Calculation Engine／Rule Algorithm 版本識別，不是重算次數，也不是 edit revision；人工修正使用獨立的 manual metadata 表示。 |

## 3. 產品邊界與共同限制

- 時區固定為 `Asia/Taipei`；日期切換、規則計算及頁面顯示均以此為準。
- 不支援跨午夜工作。上、下班時間必須屬於同一個 Asia/Taipei 工作日；輪班或跨日資料不在本版本的替代處理範圍內。
- 不支援離線寫入。無網路時僅可使用 optional browser read cache 唯讀顯示既有 DGPA 日曆資料；不上線排隊、不建立待同步打卡，絕不寫入或 queue。
- 每位使用者每天最多一筆出勤紀錄。單日可以同時有一筆出勤紀錄與一筆特殊狀態，特殊狀態不會刪除或覆蓋已有打卡資料。
- 固定休息以工作制度設定的固定分鐘數計算，不在 V1 模擬實際休息起訖或多段休息。
- 加班由系統依有效上下班時間自動計算，不需簽核，不轉換為補休，也不提供加班申請流程；實際下班時間永遠保留。
- 請假不管理假別餘額、不管理核准流程；V1 僅記錄 `LEAVE` 單日狀態與備註。

## 4. 版本路線

### 4.1 MVP：個人每日出勤可用

MVP 以「每天能可靠打卡並能修正」為完成範圍：

- 個人單一帳號登入與個人基本資料。
- 建立至少一個工作情境，保存 `company_identifier`、`project_identifier`。
- 設定一套可版本化的 Work Policy：標準上班時間、每日工作分鐘數、固定休息分鐘數、早到規則、clock-in／clock-out 進位模式與各自的分鐘數。
- 今日頁顯示目前時間與打卡預覽；只有按下按鈕才寫入資料。
- 上班打卡、下班打卡；保存實際上班／下班時間、有效上班／下班時間及預計下班時間。
- 每日一筆限制、輸入檢核、未完成紀錄提示。
- 單日補登與手動修正；建立來源以 `created_source` 保存，人工修正另以 `manually_adjusted` 與 `last_manual_edit_at` 記錄。
- 月份列表及單日詳細資料。
- 自己的資料具備 RLS 隔離；可刪除自己的單日出勤紀錄。

**MVP 驗收：** 使用者能在 Asia/Taipei 當日完成上、下班打卡，能看見實際與有效時間的差異，能補登／修正一筆紀錄，且重新整理後資料仍存在；同日不能產生第二筆紀錄。

### 4.2 V1：個人出勤報表完整化

V1 在 MVP 基礎上加入可正式取代月度 Excel 整理的功能：

- 技術約束：前端使用 Vue 3；後端資料與驗證使用 Supabase PostgreSQL、Supabase Auth、Supabase Storage 及 Row Level Security（RLS）。不因本產品需求另建獨立 API Server。
- Work Policy 依生效日期版本化，出勤紀錄保存使用過的工作制度快照與計算結果歷史快照。
- `LEAVE`、`REMOTE`、`BUSINESS_TRIP` 單日狀態及備註；不提供假別餘額或簽核。
- DGPA 行政機關辦公日曆表同步並使用實際解析的國定假日資料；canonical 資料存於 Supabase，optional browser read cache 只供離線唯讀並顯示資料時間；人工日曆覆寫優先。
- 週末、假日、補班日及打卡例外的辨識與顯示。
- 自動計算正常工時、加班及缺勤月統計；加班不簽核、不補休。
- 月曆、月表、單日編輯及報表頁。
- CSV 匯出（UTF-8 BOM）及每個工作情境一份多月份 XLSX 原始範本 Mapping 匯出。
- 使用者可刪除自己的出勤、狀態、日曆覆寫及匯出範本；平台保留 Supabase 資料備份能力。
- V1 驗收涵蓋計算測試、手算月統計、Excel 相容性及 RLS 隔離。
- V1 另須驗收獨立的 rounding、Policy 日期重疊、default context、calculation version、server time、export transform、LEAVE 及 template-specific conversion 測試。

### 4.3 技術約束與 XLSX 匯出

- V1 前端使用 Vue 3；資料與驗證使用 Supabase PostgreSQL、Auth、Storage 及 RLS。
- 不加入獨立 API；需要原子寫入或 server time 時，可使用 Supabase RPC／PostgreSQL function。
- XLSX library 對工作表、日期／時間儲存格、合併儲存格、既有格式、公式、Logo 及未 Mapping 內容的支援，必須以真實甲方範本驗證，並記錄可支援與不可支援的範圍。
- 範本格式或 library 不支援的內容應回報匯出錯誤，不得以「可保留原格式」或其他說法宣稱未驗證的能力。

## 5. 功能需求

### 5.1 帳號與工作情境

#### FR-01 個人帳號

- 使用者透過 Supabase Auth 登入。
- 每個帳號只能操作自己的 profiles、工作情境、工作制度、出勤、日曆、狀態及範本。
- V1 不提供邀請、共享、主管檢視、角色權限或公司管理員。

#### FR-02 Company / Project 識別

- 使用者可建立或編輯工作情境，至少保存：工作情境名稱、公司識別、專案識別。
- 每筆出勤紀錄、Work Policy 及 XLSX 範本均應能追溯到工作情境。
- 公司或專案識別變更不得改寫既有出勤的 company/project 識別；出勤保存當時的工作情境快照，既有紀錄仍可匯出。
- V1 多個 work context 僅用於不同公司、專案、任職期間或報表設定；不代表同日可建立多筆出勤。每位使用者同一 `work_date` 仍只能有一筆 attendance，且該筆只屬一個 context。
- 工作情境包含 `is_default`。同一使用者最多一個 `active = true` 且 `is_default = true` 的工作情境；切換預設值須以原子操作完成。
- 首次建立的 active 工作情境自動成為 default；後續建立的工作情境不會自動取代既有 default。
- 今日頁自動使用唯一的 active default context；沒有 active default 時，要求使用者選擇或完成設定，不得任意挑選工作情境。

### 5.2 Work Policy

每個工作制度至少包含：

| 欄位 | 說明 |
|---|---|
| `standard_start_time` | 標準上班時間，例如 09:00。 |
| `work_minutes` | 每日應工作分鐘數，例如 480。 |
| `fixed_break_minutes` | 固定休息分鐘數，例如 60。 |
| `early_arrival_policy` | 早到採標準上班時間或採實際到班時間。 |
| `clock_in_rounding_mode` | 上班時間模式，只允許已確認的 `NONE` 或 `CEIL`。 |
| `clock_in_rounding_minutes` | 上班進位分鐘數；使用 `CEIL` 時必須為正值，`NONE` 時不套用。 |
| `clock_out_rounding_mode` | 下班時間模式，預設為 `NONE`，可明確設定為 `NONE`、`CEIL` 或 `FLOOR`；選用 `CEIL`／`FLOOR` 時分鐘數必須為正值，未設定時不得靜默套用其他模式。 |
| `clock_out_rounding_minutes` | 下班進位分鐘數；選用 `CEIL`／`FLOOR` 時必須為正值，`NONE` 時不套用。 |
| `working_days` | 未有日曆資料時的例行工作日設定。 |
| `timezone` | V1 固定為 `Asia/Taipei`。 |
| `effective_from` / `effective_to` | 制度生效區間，用於選擇當日規則。 |

工作制度可新增新版本，不直接修改已被歷史紀錄引用的規則語意。同一使用者、同一工作情境的日期區間不得重疊；資料庫拒絕重疊寫入，應用程式也須在表單階段提示。

### 5.3 今日打卡

1. 今日頁讀取 Asia/Taipei 的日期與目前時間。
2. 取得唯一 active default context 及當日適用 Work Policy；沒有 active default 時先要求選擇／設定，不自動挑選。
3. 只計算並顯示「如果現在打卡」的預覽，不寫入資料。
4. 預覽使用 client time，僅供畫面提示；不把 client time 當成已保存的打卡時間。
5. 使用者按「上班打卡」後，才由 server／DB time 保存實際上班時間、有效上班時間、預計下班時間及建立來源 `CLOCK`。
6. 使用者按「下班打卡」後永遠由 server／DB time 保存實際下班時間，並依明確選定的 clock-out 模式產生有效下班時間，再重新計算工時與加班。
7. 完成後主要顯示實際上／下班、有效上／下班、預計下班、正常工時與自動加班；實際經過／淨工作分鐘數及其他 metadata 放在詳細資訊。
8. 已有完整紀錄時不再顯示可重複建立的打卡動作；可由單日詳細頁進行人工修正。

### 5.4 單日補登與修正

- 表單可輸入工作日期、實際上班、實際下班、工作情境、備註及必要的日曆／特殊狀態。
- 補登可套用該日期適用的 Work Policy，重新產生有效上／下班時間、預計下班及工時結果；實際下班輸入值永遠保留。
- MANUAL 建立時由使用者輸入實際時間；既有紀錄人工修正時保留 `created_source`，只更新 `manually_adjusted` 與 `last_manual_edit_at`。
- CLOCK 建立來源固定為 `CLOCK`；CLOCK 的實際時間由 server／DB time 保存，MANUAL 的實際時間由使用者輸入。
- 可修正已完成或未完成紀錄，但不得輸入跨午夜、下班早於上班或不合法的時間。
- 修正不會刪除實際時間欄位；使用者改動的值才會成為新的實際輸入值，並重新保存計算結果快照。

#### 時間來源

- CLOCK 的 `actual_clock_in_at`／`actual_clock_out_at` 必須使用 server／DB time 寫入並持久化；client time 只供預覽，不能作為 CLOCK 的保存值。
- MANUAL 的實際時間由使用者輸入，依 `Asia/Taipei` 解讀後保存為 `timestamptz`。
- 實作可透過 Supabase RPC／PostgreSQL DB function 取得 server／DB time 與完成原子寫入，不得因此新增獨立 API。

### 5.5 日期狀態與日曆的解析／呈現優先序

特殊狀態為單日資料：

| 狀態 | 行為 |
|---|---|
| `LEAVE` | 標記當日請假；可附備註，不計假別餘額。 |
| `REMOTE` | 標記遠端工作；仍可記錄上下班並依工作制度計算。 |
| `BUSINESS_TRIP` | 標記出差；仍可記錄上下班並依工作制度計算。 |

日曆也應能表達 `WORKDAY`、`HOLIDAY`，以支援一般工作日、國定假日及補班日。以下是日曆與 Day Status 的**解析／呈現優先序**，不是資料覆寫規則：

1. **特殊狀態優先呈現**：`LEAVE`、`REMOTE`、`BUSINESS_TRIP` 在同日同時存在時優先顯示，但不得覆蓋或改寫 underlying calendar classification。
2. **手動日曆覆寫其次解析**：使用者設定的工作日／假日優先於 DGPA 快取及週末判定；它不修改 DGPA 原始資料。
3. **日曆基準**：有 DGPA 快取資料時採其工作日、休假日或補班日；沒有資料時才套用週末規則，再以 Work Policy 的 `working_days` 判斷一般日期。

因此，呈現與解析優先序為「特殊狀態 → 手動日曆 →（無人工覆寫時的）DGPA／週末基準」。各層原始資料仍分開保存；例如 `HOLIDAY` 加 `LEAVE` 時顯示 `LEAVE`，但 underlying calendar 仍是 `HOLIDAY`，不可因呈現優先序而改寫。

#### DGPA 同步與快取

- V1 支援取得並使用實際解析的 DGPA 行政機關辦公日曆表，至少涵蓋日期、工作日／休假日分類及名稱（若來源提供）。
- 同步資料保存於 Supabase 的 canonical `dgpa_calendar_cache`，並記錄來源與更新時間；optional browser read cache 僅為讀取加速。
- 同步失敗時不得清空 canonical 資料；有 browser read cache 時可離線唯讀顯示，頁面須標示目前使用的資料時間，且允許人工覆寫。
- 人工覆寫不修改 DGPA 原始資料；刪除覆寫後才恢復採用日曆基準。

- 未工作的 `HOLIDAY` 即使沒有出勤紀錄，`scheduled_minutes` 與 `absence_minutes` 均為 0。

#### 打卡例外

- 任何已有打卡的日期都不得因為判定為週末、假日或 `LEAVE` 而被隱藏、刪除或改成無紀錄。
- 月曆及單日頁須標示「非一般工作日仍有打卡」等例外訊息，並保留實際上、下班時間。
- 例外資料仍可人工修正；其計算結果與使用的制度快照一併保存，不推測使用者原意。

### 5.6 計算規則

#### 有效上班時間

令 `actual_clock_in_at` 為實際上班時間，`standard_start_time` 為標準上班時間。

- 早到採標準上班：`actual_clock_in_at <= standard_start_time` 時，有效上班為 `standard_start_time`。
- 早到採實際時間：有效上班先採 `actual_clock_in_at`。
- `clock_in_rounding_mode = NONE` 時，不套用上班進位；`clock_in_rounding_mode = CEIL` 時，晚於標準上班時間的實際上班時間以 calendar boundary 為 anchor，向上進位至 `clock_in_rounding_minutes` 邊界；等於邊界時不再進到下一格。
- clock-in 與 clock-out 共用 calendar-boundary rounding anchor；V1 不提供 standard-start anchored 或分別設定 anchor 的選項。

早到規則與進位規則都要保存於使用的 Work Policy 快照，不得由頁面自行另解。

#### 有效下班時間

令 `actual_clock_out_at` 為實際下班時間。有效下班時間必須由實際下班時間衍生，並依 Work Policy 明確設定的模式處理：

- clock-out rounding mode 預設為 `NONE`；未設定時依 `NONE` 處理，不得靜默套用 `CEIL` 或 `FLOOR`。
- `clock_out_rounding_mode = NONE` 時，`effective_clock_out_at = actual_clock_out_at`。
- `clock_out_rounding_mode = CEIL` 或 `FLOOR` 時，分別依正值的 `clock_out_rounding_minutes`，以與 clock-in 共用的 calendar boundary 為 anchor 向上或向下取整至時間邊界。
- `actual_clock_out_at` 永遠保存，不能以 `effective_clock_out_at` 或 `expected_clock_out_at` 取代。

#### 預計下班（提示）

```text
expected_clock_out_at
  = effective_clock_in_at + work_minutes + fixed_break_minutes
```

預計下班只作為提示，不可當成實際下班時間，也不取代實際或有效下班。沒有實際下班前，當日工時與加班應標示為未完成或暫不結算。

#### 工時與自動加班

- `actual_elapsed_minutes = actual_clock_out_at - actual_clock_in_at`；任一實際時間缺漏時不產生此值。此欄位只描述原始時間的經過長度，不取代有效時間計算。
- 有實際上下班時，必須以有效下班減有效上班，再扣除固定休息，得到已計算工作分鐘數；不得出現負值。
- 計算公式為 `net_worked_minutes = max(0, effective_clock_out_at - effective_clock_in_at - fixed_break_minutes)`。
- 正常工時以每日 `work_minutes` 為上限；超過部分為自動加班。
- `regular_minutes = min(net_worked_minutes, work_minutes)`，`overtime_minutes = max(0, net_worked_minutes - work_minutes)`；正常工時與加班都不得改用實際下班或預計下班直接相減計算。
- 加班不需簽核、不產生補休、不扣除任何假別餘額。
- `REMOTE` 與 `BUSINESS_TRIP` 仍依工作制度計算；`LEAVE` 無打卡時以請假狀態呈現。特殊狀態日若有打卡，依「打卡例外」保留原始資料並顯示計算結果，不以猜測覆蓋資料。

#### 月統計

選定月份後，系統按每一天適用的日曆分類及 Work Policy 計算：

- 應工作時數：原本依實際解析日曆及制度判定為應工作日的每日 `work_minutes` 加總；`HOLIDAY` 及週末不列入，原本應工作日的 `LEAVE` 仍列入應工作基準並另列請假，但不列缺勤。
- `scheduled_minutes`：逐日依解析後的 Calendar／Day Status 結果及適用 Work Policy 產生的應工作分鐘數；應工作日為政策的 `work_minutes`，非應工作日為 0。未工作的 `HOLIDAY` 為 0。此值由 Domain 產生。
- 正常出勤：出勤紀錄的正常工時加總。
- `leave_minutes`：底層日曆為應工作日、當日有 `LEAVE` 且沒有出勤紀錄時，等於該日 `scheduled_minutes`；不管理餘額。
- 加班：依有效上／下班相減並扣除固定休息後產生的 `overtime_minutes` 加總。
- `absence_minutes`：底層日曆為應工作日、沒有出勤紀錄且沒有 `LEAVE` 時，等於該日 `scheduled_minutes`。
- `work_minutes` 是 Work Policy 可設定的每日值，用於正常工作日的出勤、請假及缺勤基準；不得從既有或 legacy XLSX 範本的常數推導。
- `REMOTE`、`BUSINESS_TRIP` 依工作日的應工作時數及出勤資料統計，狀態另行呈現。

未完成的當日紀錄不應被當作完整正常出勤；月統計須能識別待補下班資料。

### 5.7 歷史快照

每筆出勤紀錄至少保存：

- 實際上班、實際下班。
- 有效上班、有效下班、預計下班。
- 正常工時、加班及必要的缺勤／狀態計算結果。
- 當時適用的 Work Policy 快照：上班時間、工作分鐘數、固定休息、早到、`clock_in_rounding_mode`／分鐘數、`clock_out_rounding_mode`／分鐘數、工作日及時區。
- 計算結果快照：`effective_clock_in_at`、`effective_clock_out_at`、`expected_clock_out_at`、`scheduled_minutes`、`leave_minutes`、`absence_minutes`、正常工時、加班、計算時間、輸入狀態、日曆來源及產生結果所需的摘要。
- `calculation_version` 保存 Calculation Engine／Rule Algorithm 版本識別；重算或人工編輯不藉此欄位累加次數，edit 狀態由 `manually_adjusted`／`last_manual_edit_at` 保存。

未來修改 Work Policy 不得改寫歷史紀錄顯示的結果。使用者明確修正某日資料時，才以修正後輸入重新計算並更新該日的結果快照；操作後仍可辨識其為 `MANUAL`。

## 6. 資料模型

以下為 V1 的邏輯資料模型；欄位名稱可依實作採用 snake_case，但語意不得改變。

### 6.0 PostgreSQL 型別與時間約定

- `work_date`／`calendar_date`／`effective_from`／`effective_to` 使用 PostgreSQL `date`。
- 所有帶時間點的欄位（包括 `actual_*_at`、`effective_*_at`、`expected_*_at`、`created_at`、`updated_at`、`last_manual_edit_at`、`fetched_at`）使用 PostgreSQL `timestamptz`。
- `standard_start_time` 使用 PostgreSQL `time`；clock-in／clock-out 的分鐘數與工時計算結果使用整數分鐘。
- `timestamptz` 保存時間點；業務日期、顯示與計算一律依 `Asia/Taipei` 解讀，不用資料庫伺服器時區代替產品時區。

### 6.1 `profiles`

```text
id                  對應 auth.users.id
display_name
timezone            V1 為 Asia/Taipei
created_at
updated_at
```

### 6.2 `work_contexts`

```text
id
user_id
name
company_identifier
project_identifier
active
is_default
created_at
updated_at
```

`company_identifier` 與 `project_identifier` 是資料識別欄位；它們不代表跨帳號存取權。

### 6.3 `work_policies`

```text
id
user_id
context_id
name
standard_start_time
work_minutes
fixed_break_minutes
early_arrival_policy
clock_in_rounding_mode       NONE | CEIL
clock_in_rounding_minutes
clock_out_rounding_mode      NONE | CEIL | FLOOR
clock_out_rounding_minutes
working_days
timezone
effective_from
effective_to
created_at
updated_at
```

### 6.4 `attendance_records`

```text
id
user_id
work_date
context_id
work_policy_id
actual_clock_in_at
actual_clock_out_at
effective_clock_in_at
effective_clock_out_at
expected_clock_out_at
actual_elapsed_minutes
net_worked_minutes
regular_minutes
overtime_minutes
status_note
calculation_version
created_source      CLOCK | MANUAL
manually_adjusted
last_manual_edit_at
context_snapshot
policy_snapshot
calculation_snapshot
created_at
updated_at
```

`(user_id, work_date)` 為每日唯一識別，確保每天只有一筆出勤紀錄。`actual_*` 永遠保存原始輸入；`effective_*`、分鐘數與預計下班是衍生結果。`created_source` 保留建立時的 `CLOCK`／`MANUAL`，後續人工修正不得改寫；`manually_adjusted` 與 `last_manual_edit_at` 另記錄修正狀態。

`scheduled_minutes`、`leave_minutes`、`absence_minutes` 不直接作為 attendance input；它們由 Attendance Domain 依每日 Calendar／Day Status／Policy 解析後產生，載入每日 Report Model，再供 Export 層讀取。

### 6.5 `day_statuses`

```text
id
user_id
work_date
status              LEAVE | REMOTE | BUSINESS_TRIP
note
created_at
updated_at
```

同一使用者同一天最多一筆特殊狀態。此表不保存假別餘額或核准資訊。

`day_statuses` 與日曆資料分離：前者只保存使用者的 `LEAVE`／`REMOTE`／`BUSINESS_TRIP`，不保存週末或 DGPA 假日；後者只保存日曆基準或人工覆寫，不將其轉成特殊狀態。

### 6.6 `calendar_overrides`

```text
id
user_id
calendar_date
day_type            WORKDAY | HOLIDAY
name
note
created_at
updated_at
```

人工覆寫只表達使用者對該日曆分類的覆寫，不修改 DGPA 同步資料。

### 6.7 `dgpa_calendar_cache`

這是 Supabase 中的 canonical DGPA 同步快取，保存可重新取得的辦公日曆資料，不是使用者的出勤寫入資料：

```text
calendar_date
day_type            WORKDAY | HOLIDAY
name
source
fetched_at          timestamptz
```

瀏覽器可另有 optional read cache，僅作讀取加速及離線唯讀顯示；瀏覽器快取不是 canonical source，不能寫入出勤、日曆或任何 queue。

### 6.8 `export_templates`

```text
id
user_id
context_id
name
storage_path
month_worksheet_mapping
row_mapping
static_cell_mapping
created_at
updated_at
```

`row_mapping` 只保存逐日欄位到工作表欄位的基本對應，例如：

```text
date                   -> A [DATE_YYYY_MM_DD]
weekday                -> B [WEEKDAY_ZH_TW]
effective_clock_in_at  -> C [TIME_HH_MM]
effective_clock_out_at -> D [TIME_HH_MM]
regular_minutes        -> E [MINUTES_TO_DECIMAL_HOURS]
overtime_minutes       -> F [MINUTES_TO_DECIMAL_HOURS]
leave_minutes          -> G [MINUTES_TO_DECIMAL_HOURS]
absence_minutes        -> H [MINUTES_TO_DECIMAL_HOURS]
status                 -> I [VALUE_MAP]
scheduled_minutes      -> J [MINUTES_TO_DECIMAL_HOURS]
actual_clock_in_at     -> K [TIME_HH_MM]
actual_clock_out_at    -> L [TIME_HH_MM]
expected_clock_out_at  -> M [TIME_HH_MM]
actual_elapsed_minutes -> N
net_worked_minutes     -> O
created_source         -> P
manually_adjusted      -> Q
calculation_version    -> R
note                   -> S
```

`static_cell_mapping` 只保存一次性固定儲存格，例如：

```text
year_month             -> B3 [ROC_YEAR_MONTH]
company_identifier     -> B4
project_identifier     -> B5
```

`VALUE_MAP` 的宣告式例子可為 `LEAVE → 請假`、`REMOTE → 遠端`、`BUSINESS_TRIP → 出差`、`ABSENT → 缺勤`；這只是 template／export 的文字對照，不是 Domain enum 定義，也不可用來計算 `leave_minutes` 或 `absence_minutes`。

每個 work context 在 V1 僅有一份上傳的多月份 XLSX 範本；`month_worksheet_mapping` 以月份對應該範本的工作表，Row Mapping 以欄位對應每日資料，Static Cell Mapping 對應一次性固定儲存格。

匯出選定月份時，必須使用 `month_worksheet_mapping` 指定的工作表，並依 Row Mapping 的日期欄位和值尋找每日資料列；不得依賴固定列號、style ID 或檔名推測。範本專屬的欄位轉換不得改變 Domain 計算或補上 V1 未支援的商業規則。

範本檔案放在 Supabase Storage 的使用者專屬路徑；Mapping 僅支援 V1 所需的工作表、日期欄位、每日欄位及固定儲存格，不承諾任意公式或複雜範本語言。

### 6.9 資料庫驗證

- `work_contexts` 以概念 CHECK 保證 `is_default = true` implies `active = true`，並建立 partial unique constraint／index，限制同一 `user_id` 至多一個 `active = true AND is_default = true` 的工作情境。
- `work_policies` 由資料庫以同一 `user_id`、同一 `context_id` 的日期區間重疊驗證拒絕衝突寫入；`effective_from`／`effective_to` 不合法時也拒絕。應用程式驗證只提供較早的提示，不能取代 DB validation。
- `attendance_records` 以 `(user_id, work_date)` 唯一限制每日一筆；關聯的 context 與 policy 必須屬於同一使用者。
- `export_templates` 同一工作情境至多一份；範本的 `month_worksheet_mapping`、Row Mapping 與 Static Cell Mapping 必須屬於目前使用者及該工作情境。
- context／policy 被 attendance 引用時，外鍵 DELETE 使用 RESTRICT；不得以 cascade 或 set null 破壞歷史關聯，未被引用時才可由產品流程 hard delete。
- clock-in／clock-out rounding mode 僅允許列舉值，使用 CEIL／FLOOR 時對應分鐘數須為正值；`NONE` 不得套用 rounding minutes。clock-in 與 clock-out 均使用 calendar boundary 作為唯一 rounding anchor。
- `actual_elapsed_minutes`、`net_worked_minutes`、`regular_minutes`、`overtime_minutes` 不接受負值；缺少實際下班時，依未完成紀錄規則不寫入完成計算結果。

## 7. 頁面、Domain 與使用流程

### 7.1 Attendance Domain 到匯出

資料流固定分層，不能在範本或 CSV 寫入時重新推導商業規則：

```text
Attendance Domain
  → Report Model
  → Export Transformation
  → Template Mapping
  → CSV / XLSX
```

- **Attendance Domain**：依實際時間、Work Policy、Calendar、Day Status 產生有效時間、`actual_elapsed_minutes`、`net_worked_minutes`、`regular_minutes`、`overtime_minutes`，並為每日報表產生 `scheduled_minutes`、`leave_minutes`、`absence_minutes` 及月統計。
- **Report Model**：提供匯出穩定欄位，至少包含日期、星期、company/project 識別、狀態、實際／有效／預計上下班、`scheduled_minutes`、`actual_elapsed_minutes`、`net_worked_minutes`、`regular_minutes`、`overtime_minutes`、`leave_minutes`、`absence_minutes`、建立來源、人工修正標記、計算版本及備註。
- **Export Transformation**：只讀取 Domain／Report Model 已算好的值，執行欄位格式與有限值轉換；不能重新推導 Calendar、Day Status、Work Policy 或任何工時結果。
- **Template Mapping**：依每份範本的月份／工作表對應處理逐日 Row Mapping 與一次性的 Static Cell Mapping；範本專屬轉換只存在這一層，不回寫 Domain 或 Report Model。
- **CSV／XLSX**：都從同一個 Report Model 產生，差異只限輸出格式及已確認的 Mapping；Export 不查詢或重算 Calendar／Status／Policy。

每日報表欄位的層級責任如下：

| 欄位 | Domain 產生條件 | Report Model | Export 層 |
|---|---|---|---|
| `scheduled_minutes` | 依解析後的工作日及當日 Work Policy 產生。 | 必填每日欄位。 | 原樣讀取，必要時以分鐘轉小時。 |
| `leave_minutes` | 有符合條件的單日 `LEAVE` 且無出勤紀錄時產生。 | 必填每日欄位。 | 原樣讀取，必須使用分鐘轉小時。 |
| `absence_minutes` | 應工作日無出勤紀錄且無 `LEAVE` 時產生。 | 必填每日欄位。 | 原樣讀取，必須使用分鐘轉小時。 |

上述三欄不是 Export 計算欄位；Export 只可讀取其已完成的值。

V1 允許的 transforms 僅有：

| Transform | 定義 |
|---|---|
| `MINUTES_TO_DECIMAL_HOURS` | 將整數分鐘轉為小時的十進位值。 |
| `TIME_HH_MM` | 將時間點依 Asia/Taipei 顯示為 `HH:mm`。 |
| `DATE_YYYY_MM_DD` | 將 `date` 顯示為 `YYYY-MM-DD`。 |
| `WEEKDAY_ZH_TW` | 將日期轉為台灣中文星期文字。 |
| `ROC_YEAR_MONTH` | 將西元年轉為民國年並保留月份；實際目標文字格式由 Mapping 指定，不改變日期語意。 |
| `EMPTY_IF_ZERO` | 值為 0 時輸出空值，其他值原樣輸出。 |
| `ZERO_IF_EMPTY` | 值為空或 null 時輸出 0，其他值原樣輸出。 |
| `VALUE_MAP` | 以宣告式對照表將固定 enum／value 轉為文字；不可運算、查詢 DB、執行 script 或呼叫 expression engine。 |

不提供任意腳本、任意公式或在 Mapping 內重算工時的 transform。

### 7.2 導航

```text
今日 | 出勤 | 日曆／狀態 | 報表 | 設定
```

### 7.3 首次設定流程

```text
登入
  ↓
建立個人資料
  ↓
建立工作情境（公司／專案識別）
  ↓
建立 Work Policy
  ↓
進入今日頁
```

未設定可用制度時，今日頁應提示設定，不應自行採用未確認的預設規則。

### 7.4 今日頁流程

```text
讀取今日日期與目前時間
  ↓
取得唯一 active default context、Work Policy 與日期狀態
  ↓
顯示打卡預覽（不寫入）
  ↓
使用者按上班打卡
  ↓
保存 CLOCK 的實際／有效上班時間與政策快照
  ↓
使用者按下班打卡
  ↓
保存實際下班、有效下班並計算正常工時／自動加班
```

今日頁主要呈現：實際上班、有效上班、預計下班、實際下班（若有）、有效下班（實際下班存在時）、正常工時、加班、特殊狀態及例外提示。實際下班永遠優先保留並顯示，預計下班只作提示。

`actual_elapsed_minutes`、`net_worked_minutes`、建立來源、人工修正 metadata、`calculation_version` 與 snapshots 僅在詳細資訊或單日詳細頁提供，不是今日頁必要的主要資訊。

### 7.5 出勤頁

- 可選擇月份，以月曆或月表查看每日狀態。
- 每日列顯示日期、公司／專案識別、實際上班、有效上班、預計下班、實際下班、有效下班、實際經過分鐘數、淨工作分鐘數、正常工時、加班、狀態與備註。
- 點選日期可檢視快照並進行補登、修正或刪除該日出勤。
- 未打卡的週末、假日與缺勤必須分開顯示，不得以「沒有紀錄」推定為假日。

### 7.6 日曆／狀態頁

- 顯示 DGPA 快取的日曆來源與更新時間。
- 可對單日新增、修改或刪除 `LEAVE`、`REMOTE`、`BUSINESS_TRIP` 及備註。
- 可新增或移除 `WORKDAY`／`HOLIDAY` 人工覆寫。
- 儲存前顯示其會影響哪些日曆解析／呈現結果；不得改寫 underlying calendar classification，已有打卡時明確提示該打卡會保留。

### 7.7 報表頁

- 選擇工作情境與月份。
- 顯示應工作、正常出勤、請假、加班、缺勤及未完成紀錄；逐日資料可檢視四種分鐘數與其計算來源。
- 提供 CSV 下載及選擇已上傳範本、月份對應工作表後的 XLSX 下載。

### 7.8 設定頁

- 管理工作情境、Work Policy 及生效區間。
- 為工作情境上傳、刪除及設定一份多月份 XLSX 範本的月份／工作表、Row Mapping 與 Static Cell Mapping。
- 提供刪除個別資料及帳號所屬資料的明確操作與二次確認。

## 8. 匯出規格

### 8.1 CSV

- 以選定工作情境及月份的 Report Model 產生一列一天的資料。
- 檔案編碼為 UTF-8，開頭加入 UTF-8 BOM，以提高 Excel 開啟中文的相容性。
- 建議欄位順序：

```text
date,weekday,company_identifier,project_identifier,
actual_clock_in_at,effective_clock_in_at,actual_clock_out_at,
effective_clock_out_at,expected_clock_out_at,
scheduled_minutes,actual_elapsed_minutes,net_worked_minutes,
regular_minutes,overtime_minutes,leave_minutes,absence_minutes,
created_source,manually_adjusted,last_manual_edit_at,
calculation_version,status,
note
```

- 無值欄位保持空白，不以猜測值補入；時間與日期以 Asia/Taipei 顯示。`actual_clock_out_at`、`effective_clock_out_at` 與 `expected_clock_out_at` 為不同欄位，不得互相代填。
- CSV 匯出應包含狀態與備註，讓 `LEAVE`、`REMOTE`、`BUSINESS_TRIP` 及打卡例外可被辨識；`actual_elapsed_minutes` 與 `net_worked_minutes` 不可互換。

### 8.2 多月份 XLSX 範本 Mapping

1. 使用者為工作情境上傳一份可涵蓋多月份的甲方原始 XLSX，儲存於 Supabase Storage。
2. 每份範本設定月份／工作表對應、每日 Row Mapping 及 Static Cell Mapping；Row Mapping 的日期欄位用於辨識每日資料列。
3. 匯出選定月份時，使用該月份對應的工作表，並依日期欄位和值尋找每日資料列後套用 Row Mapping；不得依賴固定列號、style ID 或檔名推測工作表或資料列。
4. Static Cell Mapping 寫入月份、公司／專案等不隨資料列重複的值，且不與 Row Mapping 混用；`work_minutes` 及其他工時計算值均取自 Domain／Report Model，不得從 legacy XLSX 範本常數推導。
5. 匯出時複製原始範本，只將已設定 Mapping 的位置寫入；所有未 Mapping 的原始範本儲存格內容及原始格式均予以保留。
6. legacy 範本的「補休」欄位在 V1 不設定 Mapping，維持複製後的範本空白；不寫入、不推導，且 V1 不建立補休 Domain model 或計算規則。
7. XLSX library 對實際範本的支援若不足，應回報匯出錯誤，不靜默產生錯誤資料；V1 不承諾任意公式、簽核流程或跨工作表資料關聯。

## 9. 資安、資料刪除與備份

### 9.1 存取隔離

- 所有使用者資料表均保存 `user_id`，並啟用 Supabase RLS。
- SELECT、INSERT、UPDATE、DELETE 均須限制為 `auth.uid() = user_id`；不能只靠前端隱藏按鈕。
- `context_id`、`work_policy_id`、出勤及狀態等關聯資料仍須檢查同屬目前使用者。
- Storage 範本路徑以使用者識別分隔，Storage policy 只允許本人操作本人路徑。
- 不在前端保存或暴露第三方秘密；DGPA 同步所需的敏感設定若未來存在，應由受控的伺服器端機制處理。

### 9.2 刪除

- 使用者可刪除自己的單日出勤、特殊狀態、人工日曆覆寫及 XLSX 範本，但刪除有關聯資料時須先處理依賴或明確提示。
- 未被任何歷史 attendance 引用的 work context／Work Policy 可 hard delete；被引用時皆必須拒絕 hard delete。Work Context 改用 archive／deactivate（若既有實作已定義 `archived_at` 才可使用，不在此新增欄位）；Work Policy 僅能設定 `effective_to` 結束適用期間。
- context／policy 的外鍵採保留限制（RESTRICT）以維持關聯完整性；不可 cascade delete，也不可預設 set null。歷史 attendance 的 context／policy snapshot 保存當時內容，FK 則保留可追溯的關聯，兩者責任不同。
- 刪除出勤不影響 DGPA 日曆快取；刪除快取可重新同步。
- 帳號資料刪除應要求確認，並刪除 Supabase 中屬於該帳號的資料及 Storage 檔案。
- 刪除不代表平台備份立即消失；備份的保存與到期由平台備份機制管理，產品不提供未承諾的備份還原介面。

### 9.3 平台備份

- Supabase PostgreSQL 與 Storage 納入平台可用的備份機制。
- Supabase canonical DGPA cache 是可重建資料；optional browser read cache 不作為任何資料的唯一保存位置。
- 備份還原不在 V1 使用者流程內，但不得因本地快取而失去已保存的出勤紀錄。

## 10. 測試與 V1 驗收

驗證 owner：**主協調者**。

### 10.1 計算測試

計算邏輯應可在不依賴 Vue 畫面或 Supabase 的情況下測試，至少涵蓋：

- clock-in `NONE` 與 `CEIL` 必須獨立測試；`CEIL` 測試須帶入明確的 calendar-boundary fixture，標準 09:00、30 分鐘案例僅是測試資料。
- clock-out 未設定 mode 時必須驗證預設為 `NONE`；`NONE`、`CEIL`、`FLOOR` 也必須獨立測試，各模式依明確設定及共用的 calendar-boundary anchor 產生 `effective_clock_out_at`，不得把 `CEIL` 或 `FLOOR` 當成預設。
- 只在明確指定模式的函式測試中驗證向上／向下結果；測試不得替 Work Policy 的預設模式或 rounding anchor 做其他商業決定。
- 早到採標準時間與採實際時間兩種設定。
- 各 rounding mode 為 `NONE`、不同固定休息分鐘數、每日 7.5 小時與 8 小時。
- 預計下班等於有效上班＋工作分鐘數＋固定休息分鐘數，且不冒充實際下班。
- 定義並測試 `actual_elapsed_minutes = actual_clock_out_at - actual_clock_in_at`，以及 `net_worked_minutes = max(0, effective_clock_out_at - effective_clock_in_at - fixed_break_minutes)`；正常工時與加班均只能由淨工作分鐘數計算，不得改用實際或預計下班直接相減。
- 實際下班早於、等於及晚於預計下班；實際下班永遠保留，並先產生有效下班再計算正常工時與自動加班。
- 下班早於上班、跨午夜及不合法輸入必須被拒絕。

### 10.2 手算月統計

以固定月份建立可人工核對的測試資料，例如 20 個應工作日、每日 8 小時，其中 1 日 `LEAVE`、1 日無紀錄，另有一日完整出勤；該日測試資料必須明確指定 clock-out rounding mode，不得依賴預設值。

```text
應工作：160 小時
請假：8 小時
缺勤：8 小時（若該日未補登）
該日實際經過分鐘數：actual_clock_out_at - actual_clock_in_at（必須保留）
該日有效下班：依明確選定的 clock_out_rounding_mode 產生
該日淨工時：effective_clock_out_at - effective_clock_in_at - fixed_break_minutes
該日正常工時：min(淨工時, work_minutes)
該日加班：max(0, 淨工時 - work_minutes)
```

正常出勤與加班的月總計均以各日的有效上班、有效下班及固定休息逐日計算後加總，不以實際下班或預計下班直接相減。

驗收時須以逐日手算結果對照系統月統計，並另外確認週末、DGPA 假日、補班日、人工覆寫、特殊狀態及有打卡的非工作日例外不會互相誤判。

#### 每日 Report Model A–E

以同一 Work Policy（每日 480 分鐘）建立下列逐日案例，確認三個欄位由 Domain 產生並完整帶入 Report Model，不由 Export 重算：

| 案例 | underlying calendar／Day Status | 出勤 | `scheduled_minutes` | `leave_minutes` | `absence_minutes` |
|---|---|---|---:|---:|---:|
| A | `WORKDAY`／無特殊狀態 | 完整出勤 | 480 | 0 | 0 |
| B | `HOLIDAY`／`LEAVE` | 無出勤 | 0 | 0 | 0 |
| C | `WORKDAY`／無特殊狀態 | 無出勤 | 480 | 0 | 480 |
| D | `WORKDAY`／`REMOTE` | 完整出勤 | 480 | 0 | 0 |
| E | `WORKDAY`／`LEAVE` | 無出勤 | 480 | 480 | 0 |

案例 B 必須同時確認呈現優先顯示 `LEAVE`，但 underlying calendar 仍為 `HOLIDAY`；不得互相改寫。

以 A–E 五日作為一個月統計測試片段時，至少須斷言 `scheduled_minutes = 1,920`、`leave_minutes = 480`、`absence_minutes = 480`；案例 E 的請假不得被誤列為缺勤。

### 10.3 出勤與資料流程

- 開啟今日頁只預覽，不會新增資料。
- 同日重複上班打卡被阻止；下班打卡只補上同一筆紀錄。
- 即使今日頁不展示 `actual_elapsed_minutes`、`net_worked_minutes`、`created_source`、`manually_adjusted`、`last_manual_edit_at`、`calculation_version`、`snapshots`，使用者仍可完成主要上班／下班打卡流程；這些資料只在詳細資訊提供。
- 下班打卡會同時保存 `actual_clock_out_at` 與依政策產生的 `effective_clock_out_at`；`clock_out_rounding_mode = NONE` 時兩者相等。
- CLOCK 寫入的 `actual_clock_in_at`／`actual_clock_out_at` 可驗證為 server／DB time；client preview time 不會被持久化。
- MANUAL 建立使用 user input；既有紀錄修正後 `created_source` 不變，`manually_adjusted = true` 並更新 `last_manual_edit_at`。
- `calculation_version` 會隨每次計算結果保存，變更 Work Policy 不會改寫既有版本與快照。
- `calculation_version` 必須是 Calculation Engine／Rule Algorithm 版本；同一 engine 重算或 edit 不得把它當重算次數或 edit revision，人工修正只更新 manual metadata。
- 改變 Work Policy 後，舊紀錄仍顯示原政策與原計算快照。
- 無網路時不會產生已保存或待同步的打卡資料。
- 同一 context 的重疊 Work Policy 由 DB 拒絕；不同 context 或相鄰日期區間不得被錯誤阻止。
- 同一使用者最多一個 active default context；`is_default = true` 且 `active = false` 必須由 invariant 拒絕，沒有 default 時今日頁要求選擇／設定。
- 同一使用者同一日期即使選不同 context，也只能有一筆 attendance；第二筆寫入必須被 `(user_id, work_date)` 拒絕。
- 未被 history attendance 引用的 context／policy 可 hard delete；被引用時 hard delete 必須遭拒。Context 僅測試 archive／deactivate（既有 `archived_at` 才可測），Policy 僅測試設定 `effective_to`；兩者皆不得 cascade 或 set null。
- 週末、假日或 `LEAVE` 有既有打卡時，打卡資料仍可查詢、匯出及修正。
- Calendar 與 Day Status 分開測試：特殊狀態 → 手動日曆覆寫 → DGPA／週末基準的解析／呈現優先序成立，且不會把其中一種資料寫入另一種資料表。
- 另以 Calendar = `HOLIDAY`、Day Status = `LEAVE` 測試：解析／呈現優先顯示 `LEAVE`，但 underlying calendar classification 仍為 `HOLIDAY`。
- 以實際解析的國定假日資料測試未工作的 `HOLIDAY`：`scheduled_minutes` 與 `absence_minutes` 均為 0，不從範本常數推導工作分鐘數。
- `LEAVE`、`REMOTE`、`BUSINESS_TRIP` 僅接受單日狀態與備註，不建立假別餘額；部分時段、更多假別及流程留待未來擴充。

### 10.4 Excel 相容性

- CSV 檔案以 UTF-8 BOM 開頭，中文欄位及備註可由 Microsoft Excel 正確開啟。
- 使用真實甲方 XLSX 範本確認實際 library 對工作表、日期／時間儲存格、合併儲存格、既有格式、公式、Logo 及未 Mapping 內容的支援，並記錄可支援與不可支援的範圍。
- 使用同一份多月份範本確認選定月份會使用其對應工作表，並由日期欄位和值找到每日資料列後套用 Row Mapping；Static Cell Mapping 能填入固定儲存格，兩者不互相取代。
- 確認每日資料列定位不依賴固定列號、style ID 或檔名推測。
- 逐一測試 `MINUTES_TO_DECIMAL_HOURS`、`TIME_HH_MM`、`DATE_YYYY_MM_DD`、`WEEKDAY_ZH_TW`、`ROC_YEAR_MONTH`、`EMPTY_IF_ZERO`、`ZERO_IF_EMPTY`、`VALUE_MAP`；確認 transform 不會重新計算工時、查詢 DB 或執行 script。
- 確認 `leave_minutes`／`absence_minutes` 的小時欄位只能透過 `MINUTES_TO_DECIMAL_HOURS` 產生，不能以 `VALUE_MAP` 硬編或運算；`status` 可透過宣告式 `VALUE_MAP` 轉為範本文字。
- Export 測試須以既有每日 Report Model A–E 為輸入，確認 Export 只讀取 Domain／Report Model 值，不重新推導 Calendar、Day Status 或 Work Policy。
- XLSX 匯出後仍可由 Excel 開啟，所有未 Mapping 的範本儲存格內容不被清空，且原始格式可保留。
- `actual_clock_out_at`、`effective_clock_out_at` 與 `expected_clock_out_at` 的 Mapping 可分別填入；空白實際下班時不得產生有效下班，也不得以預計下班冒充實際下班。
- legacy 範本的「補休」欄位不在 V1 Mapping 內，匯出後維持複製的範本空白，且不建立補休 Domain model 或計算規則。
- `LEAVE` 的 Domain／Report Model 值在 template-specific conversion 測試中可轉為範本所需文字或空值，但不得回頭改變 Domain 計算；`work_minutes` 不得由範本常數推導。

### 10.5 RLS 隔離

至少建立兩個測試帳號：

- 帳號 A 不能 SELECT、INSERT、UPDATE 或 DELETE 帳號 B 的出勤、制度、狀態、日曆覆寫及範本資料。
- 帳號 A 不能讀取或操作帳號 B 的 Storage 範本路徑。
- 前端竄改 `user_id`、`context_id` 或資料列識別值仍不能繞過 RLS。

### 10.6 PostgreSQL 型別、時區與快取

- 以 schema／資料庫測試確認 `work_date` 為 PostgreSQL `date`、`standard_start_time` 為 `time`、所有 timestamp 欄位為 `timestamptz`，`actual_elapsed_minutes`、`net_worked_minutes`、`regular_minutes`、`overtime_minutes` 為整數。
- 以 `2026-08-28T00:30:00Z` 的 `timestamptz` 測試 Asia/Taipei 顯示為 `2026-08-28 08:30`，並確認依 Asia/Taipei 產生的業務日期正確；不得使用瀏覽器或資料庫伺服器的其他時區替代。
- 先在 Supabase canonical `dgpa_calendar_cache` 保存一筆資料，再模擬 DGPA 同步失敗；失敗後原有 canonical 資料不得被清空，且來源／資料時間仍可查詢。
- 有 optional browser read cache 時，離線只能唯讀顯示快取內容並顯示資料時間；離線不得新增、修改或刪除出勤，也不得建立任何同步 queue。恢復連線後亦不得把離線操作當成已保存資料。

## 11. 非目標（MVP 與 V1 均不做）

- 多人協作、主管檢視、複雜 RBAC、多租戶 SaaS 或公司 HR 後台。
- 假別餘額、假單簽核、加班簽核、補休換算或薪資／勞健保計算。
- 跨午夜工作、輪班、彈性班別及多段實際休息。
- 離線打卡、離線寫入、待同步佇列。
- GPS、公司 Wi-Fi、裝置限制、人臉辨識或其他地理／生物辨識打卡。
- 自動寄送報表、主管即時通知及強制提醒。
- V1 以外的複雜 XLSX 自動解析、任意公式引擎、跨工作表 Mapping 及完全自動排版。
- 以沒有紀錄直接推定假日；所有日曆判定須遵循既定優先序。

## 12. 未來擴充方向

依實際需求再評估，不影響 V1 的資料模型原則：

- `LEAVE`／`REMOTE`／`BUSINESS_TRIP` 的部分時段、更多狀態及相關流程；V1 維持單日狀態與備註、不管理餘額。
- 多個工作情境的更完整切換、同帳號多段任職歷史及更細緻的公司／專案報表。
- 部分時段請假、假別餘額、申請與核准流程。
- 輪班與跨日工作制度。
- 加班規則的最小計算單位、簽核、補休及薪資介接。
- 更完整的台灣辦公日曆自動排程與同步失敗監控。
- PWA 安裝、手機捷徑、提醒通知；仍須另行決定是否支援任何離線能力，不能默認允許離線寫入。
- 更彈性的 Excel 範本預覽、選取儲存格 Mapping、公式及多工作表處理。
- 年度出勤 Dashboard、行事曆整合及其他報表格式。

## 13. 實作原則摘要

```text
個人帳號
  ↓ 保留 company / project 識別
Work Policy（依日期版本化）
  ↓ 套用 Asia/Taipei 規則
實際時間 + 有效時間 + 預計下班提示
  ↓ 保存政策與計算結果歷史快照
每日一筆出勤 + 單日狀態／日曆優先序
  ↓
月統計
  ↓
UTF-8 BOM CSV / 多月份 XLSX Template Mapping
```

所有功能以「不丟失原始打卡、不把政策寫死、不以畫面代替 RLS、不把推算值當成實際值」為驗收底線。
