# wx-video-superpublish

腾讯视频号（WeChat Channels）高效发布技能 —— 基于 playwright-cli 的
结构化「一键填表」方案，是逐元素手动操作流程的优化版。

**核心设计：脚本只填表，不发表。** 一切自动完成到发表前一步，
最后一步永远留给 agent/人截图核验后手动点击，发布权不交给自动化。

## 为什么做这个优化

原始流程中，agent 用 playwright-cli 逐个操作发布页面（上传视频 → 填标题 →
填描述 → 传封面 → 勾原创），每一步都要截图、找元素、试错、重试，
一次发布消耗大量 token，且页面结构稍变就要现场重新摸索。

## 优化方法

### 1. 结构化配置驱动

把「 agent 现场看页面找元素」改成「读一份 JSON 配置直接执行」：

```json
{
  "videoPath": "...", "title": "...", "description": "...",
  "cover34": "...", "cover43": "...", "qrScreenshot": "..."
}
```

agent 的工作从「十几轮截图-点击-验证循环」缩减为「写配置 → 跑脚本 → 终审」。

### 2. 模板 + 配置注入

playwright-cli 的 `run-code` 沙箱没有 `require`/`setTimeout`，脚本无法读文件。
解法：`publish-fill.js` 是留有占位符的模板，`publish.js`（Node 环境）把配置
JSON 烘焙进占位符生成 `publish-fill.run.js`，再交给 run-code 执行。
等待一律用 `page.waitForTimeout`。

### 3. 踩坑修复（全部固化进脚本）

| 坑 | 修复 |
|---|---|
| 浏览器进程随命令结束被回收，登录态丢失 | 后台任务挂住 `open --persistent + sleep`，前台命令连同一 daemon |
| 中文路径文件 `setInputFiles` 报 'buffer' 错 | `publish.js` 自动复制成 ASCII 临时副本再上传 |
| `filechooser` 事件被 CLI 拦成原生模态卡死 | 一律对隐藏的 `input[type=file]` 直接 `setInputFiles`，严禁点击上传按钮 |
| 直接访问发布页被 SPA 弹回主页 | 脚本内含「检测到发表视频按钮就点、空页面回主页重来」的循环 |
| 封面弹窗的 file input 隐藏且动态挂载 | 取「打开弹窗后新出现的最后一个 input」直接写文件 |
| 短标题限 16 字且不支持中文逗号 | 填写前自动校验 6-16 字、逗号替换为空格，问题写进 warnings |
| beforeunload 弹窗阻断 | 文档注明用 `dialog-accept` 清除 |

### 4. 人在回路（human-in-the-loop）

脚本返回 `{"ok":true,"readyForReview":true,"steps":{...},"warnings":[...]}` 后
**停在发表前**。agent 截图终检确认无误后才点「发表」—— 自动化提效，
但发布动作和责任保留在人这边。

## 优化结果

| 指标 | 优化前（手动逐元素） | 优化后（一键填表） |
|---|---|---|
| agent 操作步骤 | 十几轮截图/找元素/点击/验证循环 | 写配置 + 2 条命令 + 1 次终审 |
| token 消耗 | 基准 | **约省 80%** |
| 上传/填表/双封面/原创勾选 | 每次现场摸索 | 一次全绿完成 |
| 页面结构变化适应性 | 每次重新踩坑 | 修复固化在脚本里，可复用 |
| 安全性 | 全流程自动化到发表 | 发表前强制人工核验 |

实测冒烟测试（真实视频号环境）：login(cached) / openForm / uploadVideo /
title(16字校验) / description(244字) / cover34 / cover43 / originalFlag
全部 `ok`，正确停在发表前一步。

## 安装

### 手动安装

需要 [Node.js](https://nodejs.org) 和 [playwright-cli](https://www.npmjs.com/package/@playwright/cli)。

```bash
npx skills add Stemmaker/wx-video-superpublish
```

装好后把 `scripts/publish-config.example.json` 复制为
`scripts/publish-config.json` 填好即可使用（用法见 [SKILL.md](SKILL.md)）。

### Agent 自动安装

对任意支持 skills 的 agent（Claude Code / WorkBuddy 等），直接说一句：

```
帮我从 GitHub 安装技能：npx skills add Stemmaker/wx-video-superpublish
```

或让 agent 自行执行安装命令后，用「帮我把这个视频发布到视频号：视频/封面/
文案在 <路径>」的方式触发，agent 会按 SKILL.md 的流程走。

## 使用流程（4 步）

1. 写好 `publish-config.json`
2. 后台拉起浏览器：`playwright-cli open "https://channels.weixin.qq.com/platform/post/create" --persistent && sleep 1200`
3. `node publish.js` + `playwright-cli run-code --filename=publish-fill.run.js`
4. 截图终检 → 点「发表」

## License

MIT
