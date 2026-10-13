# Paseo plugins

> **Fork notice.** This repository is a fork of
> [zhjiang22/paseo-plugins](https://github.com/zhjiang22/paseo-plugins), originally created and
> maintained by **zhjiang22**. The upstream project is released under the MIT License;
> modifications in this fork are maintained by
> [shensmart](https://github.com/shensmart). Please send issues and pull
> requests about fork-only changes here, and check the upstream repository for the original work.

Plugins for [Paseo](https://paseo.sh). Each directory is a separate plugin with its own `paseo-plugin.json`, `OVERVIEW.md`, README and license. The plugin interfaces are in Simplified Chinese.

| Plugin | Directory | What it does |
| --- | --- | --- |
| Agent Observatory | [`agent-observatory`](agent-observatory) | Results-first dashboard for every agent and subagent on a host: unread queue, timelines and execution review, usage and token statistics, scheduled runs, optional AI reviews. |
| Project Notes | [`project-notes`](project-notes) | Tasks, prompts and ideas per project; start a workspace and agent from a note; a small CLI lets agents add notes. |
| Server Browser | [`server-browser`](server-browser) | A Chromium browser on the daemon host, shared by your phone, your computer and a dedicated browser agent, with explicit handover. |
| Terracotta Themes | [`claude-theme`](claude-theme) | Six color themes, three dark and three light, derived from one perceptual tonal ladder. Unofficial; not affiliated with Anthropic. |
| Vivid Activity | [`vivid-activity`](vivid-activity) | Color-coded thinking and tool-call rows with live states, folding of finished runs and per-step timing. Based on Colorful Agent Activity by Matt Cowger. |

Requirements are declared per plugin in `requirements.paseo` (currently Paseo 0.11.0 or newer for the themes and 0.11.1 or newer for the others). Read each plugin's `OVERVIEW.md` for what it reads, writes and runs.

## Install

From Git, choosing the plugin directory:

```sh
paseo plugin add git:<owner>/<repo>:agent-observatory
```

Plugins listed in the [Paseo plugin registry](https://paseo.sh/plugins) can also be installed by their registry name.

## Development

Every plugin is an independent npm project. In a plugin directory:

```sh
npm ci
npm run typecheck
npm test
```

## 中文说明

> **Fork 说明**：本仓库 fork 自 [zhjiang22/paseo-plugins](https://github.com/zhjiang22/paseo-plugins)，原作者为 **zhjiang22**，上游项目以 MIT License 发布。本仓库中的后续修改由 [shensmart](https://github.com/shensmart) 维护。仅针对本仓库新增改动的问题和 PR 请提到这里；原始实现请参考上游仓库。

这里是几个 [Paseo](https://paseo.sh) 插件，界面都是简体中文。每个目录是一个独立插件，各自带 `OVERVIEW.md`、README 和许可证（MIT）。安装方式见上面的 Install；每个插件读写哪些文件、会不会联网或启动进程，都写在各自的 `OVERVIEW.md` 里。
