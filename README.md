# SonicNote Sync for Zotero

将 **SonicNote 妙记** 的录音同步为 Zotero 笔记条目，正文含 AI 总结（可选转写）。

每条录音 → 一个独立（standalone）Note 条目，放入专用 collection（默认 `SonicNote`），通过 tag 去重实现增量同步。

## 功能

- 🔑 用 API Key 登录妙记（与官方 MCP/技能同一套认证）
- 📥 拉取全部录音，逐条创建/更新 Zotero 笔记
- 🧠 正文默认只同步 AI 总结；可在设置中开启转写正文
- ♻️ 增量同步：用 tag `sonicnote:audio_id:<id>` 去重，标题变化时更新
- ⏱️ 可选自动定时同步（设置间隔分钟数，0=关闭）

## 安装

1. 下载 `.xpi`（见 Release），或在项目根目录 `npm run build` 生成 `.scaffold/build/*.xpi`
2. Zotero → 工具 → 附加组件 → 齿轮 ⚙️ → Install Add-on From File → 选择 `.xpi`
3. 重启 Zotero

> 需要 Zotero 7+。

## 使用

1. **工具** 菜单 → `SonicNote 妙记同步` → `设置…`
2. 填入妙记 API Key（妙记 App → 我的 → API Key 管理，格式 `sk-xxxx-...`），点「登录」
3. 设置收藏夹名称等选项 → 保存
4. **工具** 菜单 → `SonicNote 妙记同步` → `同步录音到 Zotero`

首次同步会拉取所有录音并创建笔记；之后只更新有变化（标题改名）的录音。

## 开发

基于 [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)。

```bash
npm install
npm run build      # 生成 .xpi 并做类型检查
npm run start      # 监听 + 自动重载到 Zotero（需配置 Zotero 路径）
```

## 目录

```
addon/            插件静态资源（manifest、bootstrap、prefs、设置窗口、locale）
src/
  index.ts        入口（注入 Zotero.SonicNoteSync）
  hooks.ts        生命周期（菜单、设置、同步、自动定时）
  modules/
    api.ts        妙记 HTTP API（fetch，token 失效自动重登）
    sync.ts       同步编排（collection、去重索引、分页、逐条写入）
    zotero-writer.ts  Note/Collection/Tag 写入
    md-to-html.ts     轻量 Markdown→HTML（无依赖）
  utils/
    prefs.ts      Zotero.Prefs 封装
    ztoolkit.ts   ZoteroToolkit 实例
```

## License

AGPL-3.0-or-later
