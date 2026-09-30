# dsh-local-plugins

三个自建的 **DeepSeek Harness（DSH）** 本机插件源码。

> **为什么有这个仓库**：这三个插件原先只以 `link:` 方式被 DSH profile 引用，
> 源码散落在本机 `D:\Documents\deepseek-harness\` 下，**没有任何版本控制**——
> 磁盘上一份，坏了就永久丢失。此仓库把它们纳入 Git 与异地备份。

## 插件清单

| 插件 | 类型 | 作用 |
|---|---|---|
| [`dsh-serverchan-notify`](./dsh-serverchan-notify) | host | 把每条助手回复（或仅需确认的回复）经 [Server酱](https://sctapi.ftqq.com) 推送到微信 |
| [`dsh-sidebar-preview`](./dsh-sidebar-preview) | web | 为 better-sidebar 编辑器注册**图片 + PDF** 预览器 |
| [`dsh-workpanel`](./dsh-workpanel) | web | 原生右侧栏标签页：**Todo 面板** + **Thinking（推理）面板** |

三个插件均为 MIT 许可，`version: 0.1.0`。

## 安装

这些插件按 **DSH bundle** 约定编写（`package.json` 里的 `dsh.bundle.patch` 指向 `cordis.patch.yml`），
以 `link:` 方式挂进 profile：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-serverchan-notify": "link:/path/to/dsh-local-plugins/dsh-serverchan-notify",
    "dsh-sidebar-preview":   "link:/path/to/dsh-local-plugins/dsh-sidebar-preview",
    "dsh-workpanel":         "link:/path/to/dsh-local-plugins/dsh-workpanel"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-serverchan-notify", "dsh-sidebar-preview", "dsh-workpanel"]
    }
  }
}
```

然后在 profile 的 `cordis.patch.yml` 里按插件所需填配置。

## 配置

### dsh-serverchan-notify

需要一个 Server酱 SendKey（形如 `SCT...`）。

> ⚠️ **SendKey 是凭据，不要写进本仓库。** 插件默认从本机配置文件读取，
> 本仓库 `.gitignore` 已排除 `notify-config.json` / `serverchan-notify.json`。
> 未配置时插件**静默停用出站推送**，不会报错。

### dsh-sidebar-preview / dsh-workpanel

开箱即用。`dsh-sidebar-preview` 依赖 `dsh-better-sidebar >= 0.6.0`。

## 环境要求

- Node.js `>= 20`
- 一个可加载 bundle 的 DSH 安装

## 许可

MIT
