# v1.9.0｜實收股息管理・穩定基線

2026-09-30（Asia/Taipei）使用者回報 D01～D10 全部 PASS，v1.9.0 列為穩定基線。

| 項目 | 狀態 |
|---|---|
| 實機驗收 | D01～D10：10 PASS / 0 FAIL，依使用者回報 |
| 發布時自動回歸 | 52 PASS / 0 FAIL（原有 44 + 股息 8） |
| 建置 | 發布時成功 |
| 驗收程式碼 | GitHub commit `12922e07525217388a3b80e1d6ba82d5582312c5` |
| Sites 正式版 | 版本 18；來源 commit `0f4c1f75fb5809b21dc983723e3d7c57c31f6ea2` |
| 穩定分支 | `stable/v1.9.0`，保存驗收程式碼與本次驗收文件 |

## 已驗收功能

- 年度、月份與原幣篩選，股息毛額、費稅及實收淨額彙總。
- 去年同期比較、目前持股預估對照，以及包含清倉標的的實收排行。
- 來源交易查詢與既有歷史編輯／影響預覽；修改後即時重新計算。
- 手機表格操作與 JSON 備份還原。

完整驗收紀錄：[QA_v1.9.0.md](QA_v1.9.0.md)。

## 正式入口

- [GitHub Pages](https://sparcgx.github.io/SmartPortfolio/)
- [Sites／PWA](https://smartportfolio.sparcgx2420.chatgpt.site)

本次為驗收文件與穩定分支更新，沿用已驗收的 v1.9.0 正式程式。後續功能從此基線分支開發。
