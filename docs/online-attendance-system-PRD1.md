# 線上出勤時數表 Exploration / Design Notes

> [!WARNING]
> **文件狀態：Historical / Superseded（歷史保留文件）**
>
> 本文件是早期 Exploration / Design Notes（探索／設計筆記），用來保留設計脈絡、歷史例子與替代方案。本文件提及之「Work Context」、「active / default context」等模型已被淘汰。
>
> 目前 repository 的 canonical domain vocabulary、生命週期規格與現行合約以根目錄 [`CONTEXT.md`](../CONTEXT.md) 與 **[Issue #48](https://github.com/zxjte9411/online-attendance-system/issues/48)** 為唯一權威依據。本文件僅保留作為歷史脈絡參考，不得宣稱為現行實作或規格依據。

## 1. 專案目標

建立一套方便個人使用的線上出勤時數管理系統，取代手動填寫上下班時間的流程。

系統的核心目標：

- 開啟系統時，自動帶入目前時間並提供建議上班時間。
- 根據 Work Context 的 Work Policy，自動推算預計下班時間。
- 支援不同 Work Context 的工時、午休與時間計算規則。
- 保留實際打卡時間與計算後的有效工時時間。
- 支援歷史出勤紀錄瀏覽。
- 支援國定假日、請假、加班等特殊狀況。
- 支援 CSV、XLSX 匯出。
- 未來可以將資料直接填入甲方提供的 Export Template，避免人工回填。

---

# 2. 核心設計原則

整套系統不應把某個 Work Context 的規則寫死在程式裡。

應將以下規則抽成可設定的 `Work Policy`（舊探索名稱：`AttendancePolicy`）：

- 標準上班時間
- 每日工作時數
- 午休時間
- 打卡時間計算方式
- 進位間隔
- 時區

如此未來切換 Work Context、派遣案或不同甲方時，只需要更換規則設定，
不需要修改程式。

---

# 3. 每日基本使用流程

每天第一次進入首頁時：

```text
今天：2026/08/28
目前時間：08:47

建議上班時間：09:00
預計下班時間：18:00

[ 打卡上班 ]
```

系統可以自動計算建議值，但不建議只要開啟頁面就直接新增資料。

原因包括：

- 可能只是進來查看歷史資料。
- 假日可能也會開啟系統。
- 晚上或凌晨開啟系統可能產生錯誤紀錄。

因此建議流程為：

```text
進入首頁
    ↓
讀取目前時間
    ↓
根據 Work Policy 計算
    ↓
顯示建議上班 / 下班時間
    ↓
使用者點擊「打卡上班」
    ↓
正式儲存
```

---

# 4. 工時規則 Work Policy

例如：

```text
名稱：目前派遣公司

標準上班時間：09:00
每日工作時間：8 小時
午休時間：60 分鐘

打卡模式：區間進位
進位單位：30 分鐘
```

主要欄位可以包含：

```text
Work Policy

id
name

standard_start_time
work_minutes
fixed_break_minutes

early_arrival_policy
rounding_enabled
rounding_minutes

working_days
timezone
effective_from
effective_to
```

---

# 5. 打卡時間計算模式

## 5.1 模式 A：使用實際時間

最簡單的方式。

例如：

```text
實際打卡：08:53
工作時間：8 小時
午休：1 小時
```

則：

```text
有效上班時間：08:53
預計下班時間：17:53
```

概念為：

```text
預計下班時間
=
有效上班時間
+ 工作時間
+ 午休時間
```

---

## 5.2 模式 B：固定區間進位

例如某個 Work Context 的規定：

```text
09:00 前到公司 → 09:00
09:00 ~ 09:30 → 09:30
09:30 ~ 10:00 → 10:00
```

結果：

| 實際抵達 | 有效上班時間 | 預計下班 |
|---|---:|---:|
| 08:42 | 09:00 | 18:00 |
| 08:59 | 09:00 | 18:00 |
| 09:00 | 09:00 | 18:00 |
| 09:01 | 09:30 | 18:30 |
| 09:17 | 09:30 | 18:30 |
| 09:29 | 09:30 | 18:30 |
| 09:31 | 10:00 | 19:00 |

可以拆成兩個設定：

```text
standard_start_time = 09:00
rounding_minutes = 30
```

概念演算法：

```text
arrival <= 09:00
→ effective_clock_in_at = 09:00

arrival > 09:00
→ effective_clock_in_at = 向上取整到下一個 30 分鐘
```

例如：

```text
08:30 → 09:00
08:59 → 09:00
09:00 → 09:00
09:01 → 09:30
09:30 → 09:30
09:31 → 10:00
```

---

# 6. 保留「實際時間」與「計算時間」

系統不要只保存計算後的上班時間。

例如：

```text
實際打卡時間：09:07
計算後上班時間：09:30
```

資料上應分開保存：

```text
actual_clock_in_at    = 2026-08-28 09:07
effective_clock_in_at = 2026-08-28 09:30
```

如此未來查看紀錄時可以知道：

```text
實際打卡：09:07
Work Policy 計算：09:30
預計下班：18:30
```

這樣可以避免原始資訊被 Work Policy 覆蓋，也方便未來除錯與修改規則。

---

# 7. 上班與下班打卡

預計下班時間只是系統推算值。

因此建議保存：

```text
expected_clock_out_at
```

另外仍然讓使用者實際打一次下班卡：

```text
actual_clock_out_at
```

若產品需要保存計算後的下班時間，可另存 `effective_clock_out_at`，但
不可覆蓋 `actual_clock_out_at`。clock-out rounding 的方向、時機與是否
適用尚未在此定案，請以主 PRD 的 **Open Decisions** 為準。

例如：

```text
上班：09:00
預計下班：18:00
實際下班：18:17
```

作為探索示意，也可以先觀察實際上下班之間的直接經過時間：

```text
actual_elapsed_minutes = 09:00 → 18:17 = 557
```

`actual_elapsed_minutes` 只表示 `actual_clock_in_at` 到
`actual_clock_out_at` 的直接經過分鐘數，不等於主 PRD 的
`net_worked_minutes`、`regular_minutes` 或 `overtime_minutes`，不得直接
作為工時或報表結果。

未來也比較容易支援：

- 加班
- 提早下班
- 補休
- 忘記打卡
- 外出
- 午休延長

---

# 8. 午休與每日工作時間

不要把：

```text
工作 8 小時 + 午休 1 小時
```

直接寫死成「加 9 小時」。

應保存：

```text
work_minutes
fixed_break_minutes
```

例如：

```text
工作時間：8h
午休時間：1h30m
```

09:00 上班：

```text
預計下班：18:30
```

另一個 Work Context：

```text
工作時間：7h30m
午休時間：1h
```

09:00 上班：

```text
預計下班：17:30
```

這樣切換 Work Context 時完全不需要修改程式邏輯。

---

# 9. Day Status／Special Status 與 Calendar

國定假日、週末等日曆資訊不建議直接塞進 Attendance Record。這裡要
刻意維持 Calendar 與 Day Status／Special Status 分離：前者描述日期的
工作日曆分類，後者描述使用者在單日的特殊工作狀態。

## 9.1 Calendar 與 Calendar Override

Calendar 可由辦公日曆來源、週末規則或 Work Policy 的 `working_days`
推導，候選分類例如：

```text
WORKDAY
HOLIDAY
WEEKEND
```

使用者對日期的人工調整應獨立保存為 `Calendar Override`（資料表名稱：
`calendar_overrides`），不修改來源日曆資料。舊探索版本把日曆分類與特殊
狀態混在 `DayStatus`，此為舊稱／探索階段模型，不作為最終資料模型。

## 9.2 Day Status／Special Status

`Day Status` 也可在介面上稱為 `Special Status`；V1 候選值維持精簡：

```text
LEAVE
REMOTE
BUSINESS_TRIP
```

這些狀態不取代或刪除既有 Attendance Record，也不表達假別餘額或核准
流程。國定假日、週末與補班日仍屬 Calendar，不是 Day Status。

例如：

```text
work_date = 2026-09-25
status = LEAVE
note = 中秋節前後休假
```

---

# 10. 請假設計（探索中的替代方案）

不要只支援「整天請假」是可保留的產品想法，但時段請假屬於探索中的
替代方案，並非 V1 已確認的商業規則。V1 以 `Day Status` 的 `LEAVE`
單日狀態與備註為準。

例如：

```text
Leave Record（舊探索名稱：`LeaveRecord`；非 V1 資料表）

id
work_date
leave_type

start_time
end_time
minutes

note
```

範例：

```text
日期：2026/09/03
類型：特休

09:00 ~ 11:00
共 2 小時
```

如此當天可以計算：

```text
請假：2h
工作：6h
```

未來匯出報表也容易處理。

---

# 11. 補打卡

探索時曾將補打卡視為重要候選功能；是否納入及其範圍，以歷史主 PRD 為
規格參考（現行規格以 CONTEXT.md 與 #48 為準）。

因為實際使用時很可能發生：

```text
昨天忘記開網站打卡。
```

因此除了「現在打卡」之外，可以提供：

```text
新增 / 補登出勤紀錄
```

例如：

```text
日期：2026/08/27
實際抵達：08:51

[ 套用 Work Policy ]
```

系統計算：

```text
有效上班：09:00
預計下班：18:00
```

並記錄來源：

```text
source = MANUAL
```

正常即時打卡：

```text
source = CLOCK
```

如此可以區分：

- 即時打卡
- 人工補登

---

# 12. 首頁 Dashboard

首頁應盡量簡單。

上班前：

```text
Bill，早安

08:47

8 月 28 日 星期五

目前尚未上班

依照「派遣 A」規則：

實際時間：08:47
計算上班：09:00
預計下班：18:00

[ 打卡上班 ]
```

上班後：

```text
今日上班

實際打卡：08:47
有效上班：09:00
預計下班：18:00

目前已工作：
7 小時 54 分

距離預計下班：
6 分鐘

[ 打卡下班 ]
```

---

# 13. 歷史紀錄

可以提供月列表或月曆模式。

例如：

## 2026 年 8 月

| 日期 | 狀態 | 上班 | 下班 | 工時 |
|---|---|---:|---:|---:|
| 8/24 | 工作 | 09:00 | 18:03 | 8:03 |
| 8/25 | 工作 | 09:30 | 18:32 | 8:02 |
| 8/26 | 特休 | — | — | 8:00 |
| 8/27 | 工作 | 09:00 | 18:00 | 8:00 |
| 8/28 | 工作 | 09:00 | — | — |

並提供月統計：

```text
本月應工作：160h
實際工作：153h
請假：8h
加班：1h17m
```

以上數字只是畫面示意，不是商業規則。假日是否計入 paid/reported hours
（以及對應的應工作、正常工時或其他報表欄位）請以主 PRD 的 **Open
Decisions** 為準。

---

# 14. 匯出概念：Report Model 與 Export Transformation

匯出不應直接把資料表欄位寫進檔案，而是分成以下階段：

```text
domain data
    ↓
Report Model
    ↓
Export Transformation
    ↓
mapping（需要範本時）
    ↓
CSV / XLSX / Export Template
```

其中 domain data 可包含 Work Context、Work Policy、Attendance Record、
Calendar Override 與 Day Status／Special Status。`Report Model` 是供報表
使用的穩定資料形狀；`Export Transformation` 將它轉成特定輸出格式，
最後才由 mapping 對應到檔案欄位或儲存格。

## 14.1 Report Model

第一版可先定義一個共用的報表模型，欄位維持 snake_case：

```text
date
weekday
company_identifier
project_identifier
actual_clock_in_at
effective_clock_in_at
actual_clock_out_at
effective_clock_out_at
expected_clock_out_at
regular_minutes
overtime_minutes
year_month
display_name
calendar_day_type
special_status
note
```

沒有值的欄位保持空白，不以猜測值補入。此模型不等同於資料表，也不
表示每個輸出格式都必須使用所有欄位。

## 14.2 標準 CSV / XLSX 的 Export Transformation

第一版可探索的標準輸出格式：

| 日期 | 星期 | 上班 | 下班 | 午休 | 工時 | 狀態 | 備註 |
|---|---|---:|---:|---:|---:|---|---|

```text
CSV
XLSX
```

CSV 與標準 XLSX 都應由 Report Model 經各自的 Export Transformation
產生，而不是由畫面直接拼接。這裡只保留輸出方向，不取代主 PRD 的
具體規格。

---

# 15. Export Template（甲方 Excel 範本）

真正能解決人工回填問題的功能，是 Export Template transformation。

甲方通常會提供固定格式：

```text
XXX公司出勤工時表.xlsx
```

可探索的流程是先上傳這份 Export Template，再設定其對應資訊；是否
以單一範本、每月一份範本或每月工作表處理，尚未定案，請以主 PRD 的
**Open Decisions**（Excel template monthly strategy）為準。

接著可設定：

```text
sheet_name：8月
start_row：8
date_column：A
actual_clock_in_column：D
actual_clock_out_column：E
regular_minutes_column：F
note_column：G
```

候選的 Export Transformation 不是重新產生一個 Excel，而是：

```text
讀取原始 Export Template
        ↓
複製模板
        ↓
由 Report Model 套用 mapping
        ↓
輸出新的 XLSX
```

如此可嘗試保留公司 Logo、格線、字型、欄寬、樣式、公式、簽名欄、公司
名稱及其他既有格式；實際支援邊界仍以主 PRD 為準。

---

# 16. Export Template Mapping

Export Template 可以保存 mapping；mapping 是 Export Transformation 的
最後一步，將 Report Model 欄位對應到工作表欄位或固定儲存格。

例如：

```text
Export Template：派遣公司 A
```

Mapping：

```text
report_model.date
→ A8:A38

report_model.actual_clock_in_at
→ D8:D38

report_model.actual_clock_out_at
→ E8:E38

report_model.regular_minutes
→ F8:F38

report_model.note
→ G8:G38
```

其他固定欄位：

```text
report_model.year_month
→ B3

report_model.display_name
→ B4
```

未來換工作情境，只需要新增另一份 Export Template 與 mapping；實際
每月套用策略仍以主 PRD 的 **Open Decisions** 為準。

---

# 17. 資料模型與輸出模型

以下只保留可用的探索方向。DB 與程式欄位一律採 snake_case；Work
Context、Work Policy、Attendance Record、Day Status／Special Status、
Calendar Override、Export Template、Report Model 與 Export Transformation
是概念名稱，不代表每個概念都必須成為獨立資料表。

---

## 17.1 `work_contexts`（Work Context）

```text
id
user_id
name
company_identifier
project_identifier
active
created_at
updated_at
```

---

## 17.2 `work_policies`（Work Policy）

```text
id
user_id
context_id
name
standard_start_time
work_minutes
fixed_break_minutes
early_arrival_policy
rounding_enabled
rounding_minutes
working_days
timezone
effective_from
effective_to
created_at
updated_at
```

---

## 17.3 `attendance_records`（Attendance Record）

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
regular_minutes
overtime_minutes
status_note
source
context_snapshot
policy_snapshot
calculation_snapshot
created_at
updated_at
```

`actual_*` 永遠保留原始輸入；`effective_*`、分鐘數與預計下班是衍生
結果。實際下班的有效化方式屬於 Work Policy／產品規則的一部分；尤其
clock-out rounding 請以主 PRD 的 **Open Decisions** 為準。

---

## 17.4 `day_statuses`（Day Status／Special Status）

```text
id
user_id
work_date
status
note
created_at
updated_at
```

`status` 候選值為 `LEAVE`、`REMOTE`、`BUSINESS_TRIP`。WORKDAY、HOLIDAY
及 WEEKEND 不放在此表，應由 Calendar 或 Calendar Override 表達。

---

## 17.5 `calendar_overrides`（Calendar Override）

```text
id
user_id
calendar_date
day_type
name
note
created_at
updated_at
```

`day_type` 候選值為 `WORKDAY`、`HOLIDAY`；人工覆寫不修改日曆來源資料。

---

## 17.6 `export_templates`（Export Template）

```text
id
user_id
context_id
name
storage_path
sheet_name
start_row
mapping
created_at
updated_at
```

`mapping` 對應 Report Model 欄位，而不是任意資料表欄位：

```text
report_model.date
report_model.actual_clock_in_at
report_model.actual_clock_out_at
report_model.regular_minutes
report_model.note
```

---

## 17.7 Report Model 與 Export Transformation

Report Model 與 Export Transformation 可先作為程式中的明確邊界，不急著
增加資料表。Report Model 負責承接 domain data 的報表語意，Export
Transformation 負責產生 CSV、標準 XLSX 或套用 Export Template mapping。

---

## 17.8 舊稱對照：Company / Project

舊探索內容以 `Company / Project` 表示工作情境；統一改稱 `Work Context`。
公司與專案仍可作為 Work Context 內的識別欄位：

```text
company_identifier
project_identifier
```

範例仍可表達不同工作情境套用不同 Work Policy 與 Export Template：

```text
派遣公司 A
標準上班：09:00
午休：60 分鐘
進位：30 分鐘
模板：company-a.xlsx
```

另一個 Work Context：

```text
公司 B
標準上班：08:30
午休：90 分鐘
規則：實際時間
模板：company-b.xlsx
```

---

# 18. 歷史探索中的假日資料來源想法

原探索稿曾考慮保留假日資料來源的抽象介面：

```text
HolidayProvider
```

其中一個探索候選是：

```text
ManualHolidayProvider
```

由使用者手動輸入或匯入。

另一個曾被提出的候選是：

```text
TaiwanHolidayProvider
```

自動取得台灣政府公開假日資料。

原本的考量是避免一次擴大 scope；是否採用以歷史主 PRD 為規格參考。

---

# 19. 歷史探索：功能分組候選

原探索稿曾以版本編號描述可能的功能分組；以下只保留當時的設計脈絡，
不構成版本承諾、產品路線或規格。實作範圍與優先序以歷史主 PRD
（[`online-attendance-system-PRD.md`](./online-attendance-system-PRD.md)）
為參考（現行規格由 CONTEXT.md 與 #48 取代）。

## 19.1 日常出勤候選

探索時曾考慮將下列項目視為日常使用的最小流程：

```text
登入／個人使用
設定 Work Context 與 Work Policy
打卡上班
    ↓
計算 effective_clock_in_at
    ↓
計算 expected_clock_out_at
    ↓
打卡下班
查看月出勤紀錄
手動修改紀錄
補打卡
```

可能的 Work Policy 設定例子：

```text
每日工作時間
午休時間
標準上班時間
進位分鐘數
```

## 19.2 日曆、狀態與報表候選

另一組探索方向曾包含 Calendar、Day Status／Special Status、加班、月統計、
CSV 與標準 XLSX 輸出。這些項目僅是功能脈絡，不表示必須依此順序或
分組交付。

## 19.3 Export Template 候選

也曾探索上傳 Export Template、設定 `sheet_name` 與儲存格／欄位
mapping，並產生甲方格式 XLSX。這些做法仍須經 Export Transformation
處理；具體範圍、時程及是否納入產品，均以主 PRD 為準。

---

# 20. 探索中的系統核心流程

作為理解資料流的候選示意，整套系統曾被概括為：

```text
domain data（actual_clock_*）
        ↓
Work Context + Work Policy + Calendar / Status
        ↓
Attendance Record
        ↓
Report Model
        ↓
Export Transformation
        ↓
mapping（需要 Export Template 時）
        ↓
CSV / XLSX
```

這只是設計脈絡，不是實作順序或強制架構；資料流與匯出規格以歷史主 PRD
（[`online-attendance-system-PRD.md`](./online-attendance-system-PRD.md)）
為參考（現行規格由 CONTEXT.md 與 #48 取代）。

---

# 21. 歷史探索中的架構取向

原探索稿曾將以下兩項列為重要架構取向。它們是設計脈絡與候選方案，
不是本文件另行制定的架構決策；實作時以歷史主 PRD
（[`online-attendance-system-PRD.md`](./online-attendance-system-PRD.md)）
為參考（現行規格由 CONTEXT.md 與 #48 取代）。

## 21.1 將 Work Policy 抽為設定資料

探索上可將 Work Context 的：

- 上班時間
- 工作時間
- 午休
- 早到與時間計算規則

視為設定資料而非硬編碼；是否採用及具體欄位以主 PRD 為準。

---

## 21.2 分開保存原始時間與有效時間

探索上也可將原始時間與衍生有效時間分開保存，例如：

```text
actual_clock_in_at
```

表示：

> 真正按下打卡的時間。

而：

```text
effective_clock_in_at
```

表示：

> 套用 Work Policy 後，用於計算工時的時間。

這兩者在候選設計中不互相覆蓋；實際保存方式與歷史快照要求以主 PRD
為準。

原探索稿認為這項候選取向有助於：

- 修改 Work Policy
- 除錯
- 人工補登
- 匯出不同報表
- 檢查打卡歷史

都會容易很多。

---

# 22. 歷史探索中的延伸想法（非產品路線）

原探索稿曾列出以下延伸想法；它們只是候選題材，不代表後續承諾或
開發順序。是否納入產品以歷史主 PRD（[`online-attendance-system-PRD.md`](./online-attendance-system-PRD.md)）
為參考（現行規格由 CONTEXT.md 與 #48 取代）：

- PWA / 手機桌面捷徑
- 上班提醒
- 下班提醒
- 忘記打卡提醒
- 多個 Work Context／更完整的公司與專案識別
- GPS 或公司 Wi-Fi 判定
- 加班申報
- 補休管理
- 年度特休統計
- 薪資與工時估算
- 多種 Export Template
- Google Calendar 整合
- 台灣國定假日同步
- 年度出勤統計 Dashboard

---

# 23. 歷史探索中的價值假設

原探索稿曾以「先降低每日打卡成本，再降低月底整理與甲方 Excel 回填
成本」描述價值假設。這不是實作順序、版本路線或規格；產品仍維持個人
出勤工具邊界，不擴張為 HR／SaaS 產品，實作以歷史主 PRD
（[`online-attendance-system-PRD.md`](./online-attendance-system-PRD.md)）
為參考（現行規格由 CONTEXT.md 與 #48 取代）。

當時的說明示意如下：

```text
先解決「每天打卡很麻煩」
        ↓
再解決「月底整理很麻煩」
        ↓
最後解決「甲方 Excel 回填很麻煩」
```

原稿的版本分組僅作歷史索引，此處不重述，以免形成另一套產品路線。
