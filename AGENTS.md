# 互動與範圍

- 使用繁體中文台灣用語回覆；需要使用者回覆時，列出選項並透過提問工具詢問。
- 本專案在開發容器內執行；注意容器與主機的 IP 及互動。

## CodeGraph

- 根目錄有 `.codegraph/` 時，先用 CodeGraph MCP `codegraph_explore`（或 `codegraph explore "..."`）定位與理解程式碼，再讀取或搜尋；沒有就略過。
- 修改後若 CodeGraph 顯示索引尚未同步，直接讀取列出的檔案確認內容。

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout. See `docs/agents/domain.md`.
