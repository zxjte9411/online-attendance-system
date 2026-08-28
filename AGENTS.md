# 互動與範圍

* 使用繁體中文台灣用語回覆；需要使用者回覆時，列出選項並透過提問工具詢問。
* 本專案在開發容器內執行；注意容器與主機的 IP 及互動。

## Work discipline

* **Current state first**：開始實作前先確認目前 repository 狀態。Issue 描述的是目標與需求，不代表其中內容尚未實作；沿用已存在且正確的實作，不重做已完成工作。
* **Scope**：以目前工作票的實際 acceptance scope 為實作邊界。Future notes、follow-up requirements、next-slice constraints 與 out-of-scope 內容只提供上下文，不自動成為本次實作需求。
* **Minimal change**：優先延伸現有 seam 與設計。只有需求、correctness 或既有架構明確需要時才增加 dependency、abstraction 或新的公共介面；避免與工作票無關的重構。
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
