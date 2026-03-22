---
name: lingji
description: 灵记 — 智能内容抓取与知识提炼工具。支持 1800+ 视频平台（YouTube、B站、抖音、小红书、微博等）和网页文章。视频自动提取字幕或通过 Gemini 音频转录，生成结构化知识笔记并保存到飞书多维表格。当用户说"帮我保存这个视频"、"总结这个链接"、"抓取这个URL"、"搜索知识库"、"/lingji"时使用。
allowed-tools: Bash, Read, Write, Edit
---

# OpenClaw - 智能内容抓取与知识提炼

## 首次使用检查（每次触发 Skill 时执行）

在执行任何操作前，先检查环境是否就绪：

```bash
cd "${CLAUDE_SKILL_DIR}" && node -e "
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const isWin = process.platform === 'win32';

// 跨平台环境变量读取
const getEnv = (k) => {
  const v = process.env[k];
  if (v && v !== 'undefined' && v.trim()) return v.trim();
  // Windows: 尝试从用户环境变量读取
  if (isWin) {
    try {
      return execSync('powershell -Command \"[System.Environment]::GetEnvironmentVariable(\\''+k+'\\', \\'User\\')\"', {encoding:'utf8'}).trim();
    } catch { return ''; }
  }
  return '';
};
const ok = (k) => { const v = getEnv(k); return v && v.length > 5 };

// 跨平台 ffmpeg 检查
const hasFfmpeg = () => {
  if (isWin) {
    const paths = ['C:/ffmpeg/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe', 'C:/ffmpeg/bin/ffmpeg.exe'];
    if (paths.some(p => existsSync(p))) return true;
  }
  try { execSync('ffmpeg -version', {stdio:'pipe'}); return true; } catch { return false; }
};

const checks = {
  'npm 依赖': existsSync('node_modules'),
  'ffmpeg': hasFfmpeg(),
  'GEMINI_API_KEY': ok('GEMINI_API_KEY'),
  'FEISHU_APP_ID': ok('FEISHU_APP_ID'),
  'FEISHU_APP_SECRET': ok('FEISHU_APP_SECRET'),
  'FEISHU_BITABLE_APP_TOKEN': ok('FEISHU_BITABLE_APP_TOKEN'),
  'FEISHU_BITABLE_TABLE_ID': ok('FEISHU_BITABLE_TABLE_ID'),
};
const missing = Object.entries(checks).filter(([,v]) => !v).map(([k]) => k);
if (missing.length === 0) console.log('READY');
else console.log('MISSING:' + missing.join(','));
"
```

**如果输出 `READY`** → 跳过引导，直接执行用户请求。

**如果有缺失项** → 进入引导流程，友好地逐步引导用户配置：

### 引导流程

向用户展示配置状态，然后逐项引导缺失的配置：

```markdown
## OpenClaw 首次配置

以下是需要的配置，我来帮你逐步完成：

| 配置项 | 状态 |
|--------|------|
| npm 依赖 | ✅ / ❌ 需要安装 |
| ffmpeg | ✅ / ❌ 需要安装 |
| GEMINI_API_KEY | ✅ / ❌ 需要配置 |
| FEISHU_APP_ID | ✅ / ❌ 需要配置 |
| FEISHU_APP_SECRET | ✅ / ❌ 需要配置 |
| FEISHU_BITABLE_APP_TOKEN | ✅ / ❌ 需要配置 |
| FEISHU_BITABLE_TABLE_ID | ✅ / ❌ 需要配置 |
```

**缺少 npm 依赖：**
- 自动运行：`cd "${CLAUDE_SKILL_DIR}" && npm install --production`
- 这会安装 `@google/generative-ai` 等运行时依赖

**缺少 ffmpeg：**
- 根据操作系统提示：
  - **Windows:** `winget install ffmpeg` 或从 https://www.gyan.dev/ffmpeg/builds/ 下载
  - **macOS:** `brew install ffmpeg`
  - **Linux:** `sudo apt install ffmpeg` 或 `sudo dnf install ffmpeg`
- 安装后需要重启终端

**缺少 GEMINI_API_KEY：**
- 告诉用户：前往 https://aistudio.google.com/apikey 创建 API Key
- 用户提供 Key 后，根据操作系统执行：

  **Windows:**
  ```powershell
  [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "用户提供的值", "User")
  ```

  **macOS/Linux:** 帮用户添加到 `~/.zshrc` 或 `~/.bashrc`:
  ```bash
  echo 'export GEMINI_API_KEY="用户提供的值"' >> ~/.zshrc
  source ~/.zshrc
  ```

**缺少飞书配置（FEISHU_APP_ID / APP_SECRET / APP_TOKEN / TABLE_ID）：**
- 逐步引导：
  1. 前往 https://open.feishu.cn/app 创建企业自建应用
  2. 在「权限管理」中开启：`bitable:app`（多维表格读写）和 `wiki:wiki:readonly`（知识库读取，如果表格在知识库中）
  3. 发布应用版本
  4. 创建一个飞书多维表格，添加以下字段：

     | 字段名 | 类型 |
     |--------|------|
     | 标题 | 文本 |
     | URL | 链接 |
     | 作者 | 文本 |
     | 类型 | 单选（video / article） |
     | 摘要 | 文本 |
     | 完整内容 | 文本 |
     | 字数 | 数字 |
     | 抓取时间 | 日期 |

  5. 在多维表格右上角「...」→ 添加应用为协作者，给编辑权限
  6. 用户提供 App ID、App Secret、表格链接后，根据操作系统设置环境变量：

     **Windows:**
     ```powershell
     [System.Environment]::SetEnvironmentVariable("FEISHU_APP_ID", "值", "User")
     [System.Environment]::SetEnvironmentVariable("FEISHU_APP_SECRET", "值", "User")
     [System.Environment]::SetEnvironmentVariable("FEISHU_BITABLE_APP_TOKEN", "值", "User")
     [System.Environment]::SetEnvironmentVariable("FEISHU_BITABLE_TABLE_ID", "值", "User")
     ```

     **macOS/Linux:**
     ```bash
     echo 'export FEISHU_APP_ID="值"' >> ~/.zshrc
     echo 'export FEISHU_APP_SECRET="值"' >> ~/.zshrc
     echo 'export FEISHU_BITABLE_APP_TOKEN="值"' >> ~/.zshrc
     echo 'export FEISHU_BITABLE_TABLE_ID="值"' >> ~/.zshrc
     source ~/.zshrc
     ```

  7. 如果用户给的是知识库链接（wiki/xxx），需要通过飞书 API 解析出 App Token 和 Table ID

**全部配置完成后：** 重新执行检查，确认输出 `READY`，然后继续执行用户原始请求。

---

## 核心能力

将任意 URL 转化为结构化知识笔记，保存到飞书多维表格：
- **视频**（1800+ 平台）：yt-dlp 提取字幕 → 无字幕则下载音频 → Gemini 转文字+总结
- **网页文章**：Jina Reader 提取正文 → 结构化提炼

## 环境变量加载

**Windows：** 需要用 powershell 加载用户环境变量

```bash
GEMINI_API_KEY=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')")
FEISHU_APP_ID=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_APP_ID', 'User')")
FEISHU_APP_SECRET=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_APP_SECRET', 'User')")
FEISHU_BITABLE_APP_TOKEN=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_BITABLE_APP_TOKEN', 'User')")
FEISHU_BITABLE_TABLE_ID=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_BITABLE_TABLE_ID', 'User')")
```

**macOS/Linux：** 环境变量已在 shell 中加载，无需额外前缀。确保在 `~/.zshrc` 或 `~/.bashrc` 中配置：

```bash
export GEMINI_API_KEY="your-key"
export FEISHU_APP_ID="your-id"
export FEISHU_APP_SECRET="your-secret"
export FEISHU_BITABLE_APP_TOKEN="your-token"
export FEISHU_BITABLE_TABLE_ID="your-table-id"
```

## 工作流程

### 抓取并保存

当用户提供 URL 时：

```bash
cd "${CLAUDE_SKILL_DIR}" && GEMINI_API_KEY=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')") FEISHU_APP_ID=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_APP_ID', 'User')") FEISHU_APP_SECRET=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_APP_SECRET', 'User')") FEISHU_BITABLE_APP_TOKEN=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_BITABLE_APP_TOKEN', 'User')") FEISHU_BITABLE_TABLE_ID=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_BITABLE_TABLE_ID', 'User')") node dist/cli.js fetch "<URL>"
```

stdout 输出抓取的完整内容，stderr 输出日志（含保存状态）。

处理完后，以 Markdown 向用户展示摘要：

```markdown
# [标题]

> 来源：[URL] | 作者：[作者] | 类型：视频/文章

## 核心观点
[从内容提炼]

## 精华洞见
- **[洞见1]**：具体说明
...

---
已保存到飞书「灵感助记」
```

### 搜索知识库

当用户要查找已保存的内容时：

```bash
cd "${CLAUDE_SKILL_DIR}" && FEISHU_APP_ID=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_APP_ID', 'User')") FEISHU_APP_SECRET=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_APP_SECRET', 'User')") FEISHU_BITABLE_APP_TOKEN=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_BITABLE_APP_TOKEN', 'User')") FEISHU_BITABLE_TABLE_ID=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('FEISHU_BITABLE_TABLE_ID', 'User')") node dist/cli.js search [选项]
```

搜索选项：
- `--week` — 最近一周
- `--month` — 最近一个月
- `--today` — 今天
- `--type video` 或 `--type article` — 按类型
- `<关键词>` — 按标题搜索

示例：
- 搜最近一周的视频：`search --week --type video`
- 搜关键词：`search AI 大模型`
- 最近一个月全部：`search --month`

### 批量处理

如果用户提供多个 URL，逐个执行 fetch 命令。

## 平台适配指南（按优先级排序）

### 抖音 ✅（唯一方法：两步下载法）

**为什么不用 yt-dlp：** 抖音 yt-dlp extractor 需要浏览器 cookies，且 cookies 有效期短，频繁失效。

**唯一有效方法：两步下载法**

抖音 CDN 有严格的防盗链机制：
1. `play_addr` 返回的 URL（`/playwm/`）会被 403 拒绝
2. 需要改用 `/play/`（无水印地址）
3. CDN URL 不能带 `Referer: https://www.douyin.com/`，否则 403
4. 必须分两步：先获取 302 重定向后的 CDN URL，再直接下载

```
短链接 v.douyin.com/xxx
  → 302 重定向解析 → 提取 aweme_id
  → 访问移动端页面 m.douyin.com/share/video/ID
  → 从 _ROUTER_DATA 提取 play_addr
  → 将 /playwm/ 替换为 /play/
  → Step 1: HEAD 请求获取 302 重定向的 CDN URL（带 Referer）
  → Step 2: 直接下载 CDN URL（不带 Referer）
  → ffmpeg 提取音频 → Gemini 转录
```

**关键代码逻辑：**
```typescript
// 1. 获取 CDN URL（带 Referer）
const res = await fetch(playUrl, { method: "HEAD", headers: { Referer, UA }, redirect: "manual" })
const cdnUrl = res.headers.get("location")  // 302 重定向地址

// 2. 直接下载 CDN URL（不带 Referer！）
const video = await fetch(cdnUrl)  // 注意：这里不能带 Referer
await writeFile(videoBuffer)

// 3. 本地提取音频
ffmpeg -i localVideo.mp4 -vn -acodec mp3 audio.mp3
```

### B站 ✅（yt-dlp 直连）

**方法：** yt-dlp + 直连绕代理

B站会拒绝代理 IP，代码已内置自动添加 `--proxy ""` 绕过。

```
yt-dlp --proxy "" --write-auto-subs --sub-lang zh-Hans,en URL
```

如果有字幕直接用字幕，无字幕则下载音频转文字。

### YouTube ✅（yt-dlp 标准方式）

**方法：** yt-dlp 标准调用，优先提取字幕

```
yt-dlp --write-auto-subs --sub-lang zh-Hans,en,zh-Hant URL
```

### 微信公众号 ✅（本地直连）

**为什么不用 Jina Reader：** 微信会拦截海外 IP，Jina Reader 无法访问。

**方法：** 本地 fetch HTML + 提取正文

代码已内置：检测到 `mp.weixin.qq.com` 自动切换为本地抓取模式。

### 普通网页 ✅（Jina Reader）

**方法：** 通过 Jina Reader API 提取正文

```
https://r.jina.ai/{URL}
```

Jina Reader 会自动处理：广告过滤、正文提取、格式化。

### 小红书 / 微博 / 知乎 / 快手 ⚠️（待验证）

这些平台暂未充分测试，理论上 yt-dlp 支持，但可能需要：
- 浏览器 cookies（小红书）
- 直连绕代理（微博、知乎）

遇到问题时，优先尝试：
1. yt-dlp + `--proxy ""`（国内平台）
2. yt-dlp + `--cookies-from-browser chrome`（需要登录的平台）

---

## 平台支持速查表

| 平台 | 首选方法 | 备用方法 | 状态 |
|------|----------|----------|------|
| 抖音 | 两步下载法（移动端页面→CDN） | 无 | ✅ 已验证 |
| B站 | yt-dlp + 直连绕代理 | — | ✅ 已验证 |
| YouTube | yt-dlp 字幕/音频 | — | ✅ 已验证 |
| 微信公众号 | 本地直连抓取 | — | ✅ 已验证 |
| 普通网页 | Jina Reader | — | ✅ 已验证 |
| 小红书 | yt-dlp + cookies | — | ⚠️ 待验证 |
| 微博/知乎/快手 | yt-dlp + 直连 | — | ⚠️ 待验证 |

---

## 代理处理（已内置）

用户可能开启了代理（VPN/Clash 等），国内平台会拒绝代理 IP。
代码已内置：yt-dlp 调用时对国内站点自动添加 `--proxy ""`（直连），无需用户手动配置。

## 注意事项

- 视频处理可能需要较长时间（下载音频+转录），提前告知用户
- 飞书文本字段截取前 50000 字
- 如果 fetch 失败，检查 GEMINI_API_KEY 和 ffmpeg 是否可用
- 用户传来的抖音链接通常包含大量无关文字（口令），只需提取其中的 URL 即可
