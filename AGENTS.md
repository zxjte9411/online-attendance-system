# 互動與範圍

* 使用繁體中文台灣用語回覆；需要使用者回覆時，列出選項並透過提問工具詢問。
* 本專案在開發容器內執行；注意容器與主機的 IP 及互動。
* **Local Supabase**：在開發容器執行 migration、reset 或資料庫測試而無法連上本機 Docker 服務時，先依 `README.md` 的「開發容器中的 Local Supabase」確認拓樸與指令。

## Work discipline

* **Current state first**：開始實作前先確認目前 repository 狀態。Issue 描述的是目標與需求，不代表其中內容尚未實作；沿用已存在且正確的實作，不重做已完成工作。
* **Scope**：以目前工作票的實際 acceptance scope 為實作邊界。Future notes、follow-up requirements、next-slice constraints 與 out-of-scope 內容只提供上下文，不自動成為本次實作需求。
* **Reuse before build**：新增 helper、component、abstraction 或 dependency 前，先搜尋 repository 是否已有可重用的 seam / utility，再評估平台或標準 API 與既有 dependency。對非領域特有、且自行實作會產生明顯複雜度的能力，先確認是否有成熟且持續維護的套件可用；只有在套件比小型本地實作更簡單、安全且與現有 toolchain 相容時才新增 dependency。不要為少量清楚的邏輯引入套件。
* **Smallest sufficient solution**：以「讓目前 acceptance criteria 完整成立的最小實作」為目標。不要預先支援未要求的 future case、extension point、generic framework、compatibility layer 或 configuration。新的 abstraction / public interface 必須由目前 use case 需要，並且現在就能降低複雜度。
* **Focused edits**：保持與目前工作票無關的程式碼穩定。只有在直接影響目前 spec、correctness、verification 或 documented standard 時才重構鄰近程式；其他 cleanup、rename、style consolidation 或架構改善應記為 follow-up，而不是順手納入本次變更。
* **Boring over clever**：優先採用直接、可讀、符合 ecosystem 慣例且容易驗證的做法。沒有目前需求或量測證據時，不加入為效能、通用性或未來擴充而生的額外 indirection、cache、framework 或設計層。
* **Verification**：完成修改後執行 repository 定義的最高層 verification seam，並修復本次變更造成的 failure。驗證命令以目前 repository configuration 為準，不建立功能重疊的第二套驗證流程。
* **External configuration**：repository 只保存適合 version control 的設定。Credential、secret 與只能在 Google Cloud、Supabase、Cloudflare 等外部控制台完成的 production 設定，應列為 external action，不以假值代替，也不寫入版本庫。

## CodeGraph

* 根目錄有 `.codegraph/` 時，先用 CodeGraph MCP `codegraph_explore`（或 `codegraph explore "..."`）定位與理解程式碼，再讀取或搜尋；沒有就略過。
* 修改後若 CodeGraph 顯示索引尚未同步，直接讀取列出的檔案確認內容。

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout. See `docs/agents/domain.md`.

## Development workflow

Implementation work follows the repository branch-to-PR workflow. Before modifying code for an issue or ticket, read `docs/agents/development-workflow.md` and follow it through Pull Request delivery.
