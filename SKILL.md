---
name: wx-video-superpublish
description: 腾讯视频号高效发布。基于 playwright-cli 的结构化一键填表：上传视频、短标题、描述、双封面、原创声明自动完成，停在发表前一步由 agent 终审。对比逐元素手动操作省约 80% token。
---

# 腾讯视频号发布（wx-video-superpublish）

使用浏览器自动化（playwright-cli）通过微信视频号助手发布视频作品。
核心是一份结构化配置驱动的「一键填表」脚本：agent 只需写好 JSON 配置、
跑两条命令，即可到达发表前一步，最后人工/agent 核验后点「发表」。

## 功能特性

- 📹 视频上传（支持 MP4 格式，最大 2GB）
- 📝 短标题（自动校验 6-16 字、逗号自动转空格）
- 📖 视频描述（最多 1000 字，#话题 标签直接写进描述）
- 🖼️ 双封面自动上传（3:4 个人主页卡片 / 4:3 分享卡片）
- ✅ 原创声明自动勾选
- 🔐 登录检测：未登录自动截二维码等扫码（持久化 profile 下二次免扫码）
- 🛑 **停在发表前一步**：发表永远由 agent 截图核验后手动点击

## 快速开始

### 0. 前置条件

- Node.js 与 playwright-cli（`npm i -g @playwright/cli` 或对应发行版）
- 视频文件、封面图（3:4 与 4:3 两张，可选）、描述文案

### 1. 写配置

复制 `scripts/publish-config.example.json` 为 `scripts/publish-config.json` 并填写：

```json
{
  "videoPath": "/path/to/video.mp4",
  "title": "16 字以内的短标题",
  "description": "描述正文，话题直接写 #话题名",
  "cover34": "/path/to/cover-3x4.png",
  "cover43": "/path/to/cover-4x3.png",
  "qrScreenshot": "/path/to/channels-qr.png",
  "scanTimeoutSec": 300,
  "uploadTimeoutSec": 600
}
```

### 2. 拉起浏览器（后台保活）

playwright-cli 的浏览器进程会随命令结束被回收，必须用后台任务挂住：

```bash
playwright-cli open "https://channels.weixin.qq.com/platform/post/create" --persistent && sleep 1200   # 放到后台运行
```

### 3. 一键填表

```bash
cd <skill目录>/scripts && node publish.js
playwright-cli run-code --filename="<skill目录>/scripts/publish-fill.run.js"
# 结果行 JSON：{"ok":true,"readyForReview":true,"steps":{...},"warnings":[...]}
```

`publish.js` 负责准备（中文路径自动复制成 ASCII 临时副本 + 配置注入），
`publish-fill.run.js` 是注入后的填表脚本。steps 里每个环节报 `ok`/失败原因。

### 4. 终审发表

agent 截图核验（`playwright-cli screenshot`），确认视频/封面/文案无误后点「发表」。

## 已知坑（脚本已处理，勿绕回老路）

- playwright-cli 浏览器进程随命令结束被回收 → 必须用后台任务挂住 `open + sleep`
- run-code 沙箱无 require/setTimeout → 配置只能注入模板；sleep 用 `page.waitForTimeout`
- 中文路径文件 setInputFiles 会报 'buffer' 错 → publish.js 自动复制成 ASCII 临时文件
- filechooser 事件被 CLI 拦截成模态 → 一律用 `input[type=file].setInputFiles`，
  严禁在 run-code 里点击触发上传选择的元素
- 直接访问 /post/create 可能被 SPA 弹回主页 → 脚本内含「回主页点发表视频」的循环
- 短标题限 16 字、不支持中文逗号（空格替代）、最少 6 字否则发布失败
- 页面可能有 beforeunload 弹窗（表单未保存），用 `playwright-cli dialog-accept` 清掉

## 平台规则速查

| 项目 | 要求 |
|------|------|
| 短标题 | 6-16 字（少于 6 字发布失败），逗号不支持 |
| 描述 | 最多 1000 字，建议 50-200 字 |
| 视频 | MP4，2GB 以内，建议 1080P+ |
| 封面 | 3:4（个人主页卡片）/ 4:3（分享卡片），均可自定义 |
| 原创 | 必须勾选声明并同意须知 |

## 常见问题

- **标题提示少于 6 字？** 视频号短标题必须至少 6 个字
- **上传失败？** 检查是否 MP4、大小是否超 2GB
- **扫码失败？** 确保微信已绑定手机号，在手机上确认授权
- **发布后找不到视频？** 进入「内容管理」→「视频」查看状态

## 相关链接

- 视频号助手：https://channels.weixin.qq.com
