# LingJi Skill (灵记)

智能内容抓取与知识提炼工具，作为 Claude Code Skill 使用。支持 1800+ 视频平台（YouTube、B站、抖音、小红书、微博等）和网页文章，自动提取字幕或通过 Gemini 音频转录，生成结构化知识笔记并保存到飞书多维表格。

## 安装

### 方式一：npx 一键安装（推荐）

```bash
npx skills add https://github.com/EveryReach/LingJi-Skill -g -y
cd ~/.claude/skills/lingji && npm install --production
```

安装完成后，重启 Claude Code 即可使用。

### 方式二：手动安装

```bash
git clone https://github.com/EveryReach/LingJi-Skill.git ~/.claude/skills/lingji
cd ~/.claude/skills/lingji && npm install --production
```

## 前置要求

### ffmpeg

**Windows:**
```powershell
winget install ffmpeg
# 或从 https://www.gyan.dev/ffmpeg/builds/ 下载，解压到 C:\ffmpeg\
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg  # Debian/Ubuntu
sudo dnf install ffmpeg  # Fedora
```

## 配置环境变量

### 获取 Gemini API Key
前往 https://aistudio.google.com/apikey 创建 API Key

### 创建飞书应用
1. 前往 https://open.feishu.cn/app 创建「企业自建应用」
2. 在「权限管理」中开启以下权限（见下方详细说明）
3. 发布应用版本

### 创建飞书多维表格
创建一个多维表格，添加以下字段：

| 字段名 | 类型 |
|--------|------|
| 标题 | 文本 |
| URL | 链接 |
| 作者 | 文本 |
| 类型 | 单选（video / article） |
| 平台 | 文本 |
| 摘要 | 文本 |
| 完整内容 | 文本 |
| 字数 | 数字 |
| 抓取时间 | 日期 |

然后在表格右上角「...」→ 添加应用为协作者，给编辑权限。

### 设置环境变量

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")
[System.Environment]::SetEnvironmentVariable("FEISHU_APP_ID", "cli_xxx", "User")
[System.Environment]::SetEnvironmentVariable("FEISHU_APP_SECRET", "xxx", "User")
[System.Environment]::SetEnvironmentVariable("FEISHU_BITABLE_APP_TOKEN", "xxx", "User")
[System.Environment]::SetEnvironmentVariable("FEISHU_BITABLE_TABLE_ID", "tblxxx", "User")
```

**macOS/Linux:**
```bash
echo 'export GEMINI_API_KEY="your-key"' >> ~/.zshrc
echo 'export FEISHU_APP_ID="cli_xxx"' >> ~/.zshrc
echo 'export FEISHU_APP_SECRET="xxx"' >> ~/.zshrc
echo 'export FEISHU_BITABLE_APP_TOKEN="xxx"' >> ~/.zshrc
echo 'export FEISHU_BITABLE_TABLE_ID="tblxxx"' >> ~/.zshrc
source ~/.zshrc
```

## 使用

在 Claude Code 中直接使用：

```
帮我保存这个视频 https://www.youtube.com/watch?v=xxx
总结这个链接 https://example.com/article
搜索知识库 抖音
```

## 飞书权限配置

在飞书开放平台的应用后台，进入「权限管理」，开启以下权限：

### 必需权限

| 权限名称 | 权限 ID | 说明 |
|----------|---------|------|
| 查看、评论、编辑和管理多维表格 | `bitable:app` | 读写多维表格数据 |
| 获取多维表格元数据 | `bitable:app:readonly` | 读取表格结构 |

### 可选权限

| 权限名称 | 权限 ID | 说明 |
|----------|---------|------|
| 获取知识库空间节点信息 | `wiki:wiki:readonly` | 如果表格在知识库中，需要此权限 |

### 获取表格 App Token 和 Table ID

**方式一：从 URL 获取**

多维表格 URL 格式：
```
https://xxx.feishu.cn/base/{APP_TOKEN}?table={TABLE_ID}
```

例如 `https://abc123.feishu.cn/base/bcnDnY?table=tblXYZ`：
- App Token: `bcnDnY`
- Table ID: `tblXYZ`

**方式二：知识库链接**

如果表格在知识库中（URL 包含 `wiki/`），需要通过 API 解析：
```bash
curl -H "Authorization: Bearer {tenant_access_token}" \
  "https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token={wiki_token}"
```

## 支持的平台

### 视频平台

| 平台 | 首选方法 | 状态 |
|------|----------|------|
| 抖音 | 两步下载法（移动端页面→CDN） | ✅ 已验证 |
| B站 | yt-dlp + 直连绕代理 | ✅ 已验证 |
| YouTube | yt-dlp 字幕/音频 | ✅ 已验证 |
| X/Twitter | yt-dlp + Gemini 转录 | ✅ 已验证 |
| 小红书 | 移动端页面 + JSON 解析 | ✅ 已验证 |
| 微博/知乎/快手 | yt-dlp + 直连 | ⚠️ 待验证 |

### 网页文章

| 平台 | 方法 | 状态 |
|------|------|------|
| 微信公众号 | 本地直连抓取 | ✅ 已验证 |
| 普通网页 | Jina Reader | ✅ 已验证 |
| GitHub | Jina Reader | ✅ 已验证 |

## 工作流程

### 抓取视频
1. yt-dlp 探测视频信息
2. 优先提取字幕（zh-Hans/en）
3. 无字幕则下载音频 → Gemini 转文字+总结
4. 生成结构化知识笔记
5. 保存到飞书多维表格

### 抓取文章
1. Jina Reader 提取正文（微信公众号走本地直连）
2. Gemini 结构化总结
3. 保存到飞书多维表格

### 搜索知识库

```bash
# 在 Claude Code 中
搜索最近一周的视频
搜索抖音的内容
搜索 AI 大模型
```

## 结构化输出框架

Gemini 会按以下框架输出知识笔记：

1. **一句话核心** — 核心主张/方法/发现
2. **为什么值得留存** — 解决的问题/独特视角
3. **精华洞见** — 3-5 个最有价值的洞见
4. **可立即行动的建议** — 具体可执行的事项
5. **值得记住的原话或案例** — 金句/数据/案例
6. **背景标注** — 适合人群/内容类型/标签

## 目录结构

```
lingji/
├── SKILL.md          # Claude Code Skill 定义
├── README.md         # 本文件
├── package.json      # npm 依赖
├── dist/             # 编译后的代码
│   ├── cli.js
│   ├── fetchers/
│   └── lib/
│       ├── douyin.js     # 抖音两步下载法
│       ├── ytdlp.js      # yt-dlp 封装
│       ├── gemini.js     # Gemini 转录/总结
│       └── feishu.js     # 飞书 API
└── node_modules/
```

## 注意事项

- 视频处理可能需要较长时间（下载音频+转录），60 分钟视频约需 2-3 分钟
- 飞书文本字段最多 50000 字，超出会被截断
- 抖音链接通常包含大量口令文字，只需提取其中的 URL
- 国内平台（B站、抖音等）会自动绕过代理直连

## License

MIT
