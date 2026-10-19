# dsh-local-plugins

**四个自建的 DeepSeek Harness（DSH）插件源码。**

[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![plugins](https://img.shields.io/badge/plugins-4-4d6bfe)](.)
[![deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](.)

> **为什么有这个仓库**：这些插件原先只以 `link:` 方式被 DSH profile 引用，
> 源码散落在本机目录下，**没有任何版本控制** —— 磁盘上一份，坏了就永久丢失。
> 此仓库把它们纳入 Git 与异地备份。

---

## 插件清单

| 插件 | 类型 | 作用 | 自测 |
|---|---|---|---|
| [`dsh-quick-panel`](./dsh-quick-panel) | web | 侧边栏按钮 + 中列快捷面板：会话视图切换 / 对话区显示选项 / 右侧栏 Tab 切换 | ✅ 10 项接线冒烟 |
| [`dsh-workpanel`](./dsh-workpanel) | web | 原生右侧栏标签页：**Todo 面板** + **Thinking（推理）面板** | — |
| [`dsh-sidebar-preview`](./dsh-sidebar-preview) | web | 为 better-sidebar 编辑器注册**图片 + PDF** 预览器 | — |
| [`dsh-serverchan-notify`](./dsh-serverchan-notify) | host | 把助手回复（或仅需确认的回复）经 [Server酱](https://sctapi.ftqq.com) 或**企业微信群机器人**推送到手机 | — |

四个插件均为 MIT 许可、`version: 0.1.0`、**零运行时依赖**。

### 各插件说明

**`dsh-quick-panel`** —— 纯官方 Slot/Service 接线，**不改 DSH 源码**。
它做的是把 DSH 已有但散落在多处的开关集中到一处：换会话视图、调对话区显示、
切右侧栏 tab，不用再翻设置页。自带 `tests/smoke-client.mjs`，用桩件验证 10 项接线
（视图切换 / 偏好落 trajectory / 槽位调用 / 右侧栏状态 / 会话定位等）。

**`dsh-workpanel`** —— 把 Todo 与 Thinking 两个面板做成右侧栏原生标签页，
而不是塞进对话框。

**`dsh-sidebar-preview`** —— 图片与 PDF 直接在编辑器里预览，不用下载再看。
依赖 `dsh-better-sidebar >= 0.6.0`。

**`dsh-serverchan-notify`** —— 两条出站通道，可同时启用：
Server酱（微信）与企业微信群机器人。企业微信走独立 webhook，与 SendKey 互不影响。

---

## 安装

这些插件按 **DSH bundle** 约定编写（`package.json` 里的 `dsh.bundle.patch`
指向 `cordis.patch.yml`），以 `link:` 方式挂进 profile：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-quick-panel":       "link:/path/to/dsh-local-plugins/dsh-quick-panel",
    "dsh-workpanel":         "link:/path/to/dsh-local-plugins/dsh-workpanel",
    "dsh-sidebar-preview":   "link:/path/to/dsh-local-plugins/dsh-sidebar-preview",
    "dsh-serverchan-notify": "link:/path/to/dsh-local-plugins/dsh-serverchan-notify"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-quick-panel",
        "dsh-workpanel",
        "dsh-sidebar-preview",
        "dsh-serverchan-notify"
      ]
    }
  }
}
```

然后在 profile 的 `cordis.patch.yml` 里按插件所需填配置，**重启 DSH**。

> `link:` 安装不跑 build，因此 `lib/` 已随仓库入库，不需要构建步骤。

---

## 配置

### dsh-quick-panel / dsh-workpanel / dsh-sidebar-preview

开箱即用。`dsh-sidebar-preview` 需要先装 `dsh-better-sidebar >= 0.6.0`。

### dsh-serverchan-notify

需要 **Server酱 SendKey**（形如 `SCT...`）和/或 **企业微信群机器人 webhook**
（形如 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<uuid>`）。

> ⚠️ **两者都是凭据，不要写进本仓库。**
> 插件从本机配置文件读取，`.gitignore` 已排除 `notify-config.json` / `serverchan-notify.json`。
> 未配置时插件**静默停用出站推送**，不会报错 —— 这是刻意的：
> 通知是附加能力，不该因为它没配就让主流程报错。

---

## 环境要求

- Node.js `>= 20`
- 一个可加载 bundle 的 DSH 安装

## 开发与自测

```bash
# dsh-quick-panel 的接线冒烟（无需真实 DSH）
cd dsh-quick-panel && node tests/smoke-client.mjs
```

CI 会对所有插件的 JS 做语法检查，并校验每个插件的
`package.json` / `lib/index.js` / `cordis.patch.yml` 三件套齐全。

## 安全约定

- **凭据一律不进仓库**：`.gitignore` 覆盖 `.env*`、`*.key`、`*.pem`、
  `notify-config.json`、`serverchan-notify.json`。
- **本地备份目录不进仓库**（`*.bak-*`）：备份是本地保险，不是源码。
  入库只会让同一份代码出现两个副本，审阅者分不清哪个是权威版本 ——
  要留历史请用 git 本身。
- CI 有敏感信息扫描，命中本机绝对路径或凭据形态即失败。

## 许可

[MIT](./LICENSE)
