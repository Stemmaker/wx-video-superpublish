#!/usr/bin/env node
/**
 * 视频号一键填表 —— 准备脚本（中文路径转 ASCII 副本 + 配置注入）
 *
 * 用法：
 *   node publish.js          # 准备 publish-fill.run.js，输出 {"ok":true,"cmd":"..."} 后
 *   由外层 shell 执行输出的 cmd（playwright-cli run-code），结果行 JSON 即填表结果
 *
 * 填表完成后停在「发表」前一步；发表由 agent 人工确认后点击。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = __dirname;
const C = JSON.parse(fs.readFileSync(path.join(dir, 'publish-config.json'), 'utf8'));

// run-code 沙箱对中文路径的 setInputFiles 有 bug，统一复制成 ASCII 临时副本
function toSafe(p, tag) {
  if (!p) return p;
  if (/^[\x20-\x7e]+$/.test(p)) return p;
  const dest = path.join(os.tmpdir(), 'wxchannels-' + tag + path.extname(p));
  fs.copyFileSync(p, dest);
  return dest.replace(/\\/g, '/');
}
C.videoPath = toSafe(C.videoPath, 'video');
C.cover34 = toSafe(C.cover34, 'cover34');
C.cover43 = toSafe(C.cover43, 'cover43');
if (C.qrScreenshot) C.qrScreenshot = C.qrScreenshot.replace(/\\/g, '/');

// 注入配置到模板
const tpl = fs.readFileSync(path.join(dir, 'publish-fill.js'), 'utf8');
const CONFIG_RE = /\/\*__PUBLISH_CONFIG__\*\/\{\};?\/\*__PUBLISH_CONFIG_END__\*\//;
if (!CONFIG_RE.test(tpl)) {
  console.log(JSON.stringify({ ok: false, fatal: 'template placeholder missing' }));
  process.exit(1);
}
const runPath = path.join(dir, 'publish-fill.run.js').replace(/\\/g, '/');
fs.writeFileSync(runPath, tpl.replace(CONFIG_RE, JSON.stringify(C)));
console.log(JSON.stringify({ ok: true, cmd: 'playwright-cli run-code --filename="' + runPath + '"' }));
