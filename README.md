# 灵记 (LingJi) - 智能内容抓取与知识提炼工具

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D%2018.0.0-brightgreen" alt="Node.js >= 18.0.0">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
</p>

灵记是一款专为个人知识管理（PKM）打造的智能内容抓取与知识提炼工具。它能够自动抓取 1800+ 视频平台和网页文章的内容，通过 AI 进行结构化总结，并将知识笔记保存到飞书多维表格，构建属于你的个人知识库。

## ✨ 核心功能

### 智能内容抓取
- **视频平台支持**：YouTube、B站、抖音、小红书、微博、西瓜视频、快手、TikTok、X/Twitter、Instagram 等 1800+ 平台
- **网页文章抓取**：通过 Jina Reader 提取正文，自动过滤广告和干扰元素
- **微信公众号**：本地直连抓取，绕过海外 IP 限制

### AI 知识提炼
- **字幕优先提取**：自动提取视频字幕，支持多种语言（简中/繁中/英文）
- **音频转录**：无字幕视频通过 Gemini 进行音频转文字 + 智能总结
- **结构化输出**：按 PKM 框架输出核心观点、精华洞见、可行动建议

### 飞书知识库集成
- **自动归档**：抓取的内容自动保存到飞书多维表格
- **智能搜索**：支持按时间范围、内容类型、关键词搜索知识库
- **字段完整**：标题、URL、作者、类型、摘要、完整内容、字数、抓取时间

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- ffmpeg（用于音频处理）
- npm 依赖：`@google/generative-ai`

### 安装步骤

1. **克隆仓库**
```bash
git clone https://github.com/EveryReach/LingJi-Skill.git
cd LingJi-Skill
npm install
```

2. **安装 ffmpeg**

```bash
# macOS
brew install ffmpeg

# Windows
winget install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

3. **配置环境变量**

```bash
# Google Gemini API（用于音频转录和文章总结）
export GEMINI_API_KEY="your-gemini-api-key"

# 飞书应用配置（用于知识库存储）
export FEISHU_APP_ID="your-app-id"
export FEISHU_APP_SECRET="your-app-secret"
export FEISHU_BITABLE_APP_TOKEN="your-app-token"
export FEISHU_BITABLE_TABLE_ID="your-table-id"
```

**获取 API Key：**
- Gemini API Key: https://aistudio.google.com/apikey
- 飞书应用配置: https://open.feishu.cn/app

4. **配置飞书多维表格**

在飞书多维表格中添加以下字段：

| 字段名 | 类型 |
|--------|------|
| 标题 | 文本 |
| URL | 链接 |
| 作者 | 文本 |
| 类型 | 单选（video / article）|
| 平台 | 文本 |
| 摘要 | 文本 |
| 完整内容 | 文本 |
| 字数 | 数字 |
| 抓取时间 | 日期 |

## 📖 使用指南

### CLI 命令

```bash
# 抓取并保存内容
node dist/cli.js fetch <URL>

# 搜索知识库
node dist/cli.js search [选项]
  --week              # 最近一周
  --month             # 最近一个月
  --today             # 今天
  --type video        # 仅视频
  --type article      # 仅文章
  --limit N           # 返回条数（默认20）
  <关键词>             # 按标题搜索
```

### 使用示例

```bash
# 抓取 YouTube 视频
node dist/cli.js fetch "https://www.youtube.com/watch?v=xxxxx"

# 抓取 B站视频
node dist/cli.js fetch "https://www.bilibili.com/video/BVxxxxx"

# 抓取微信公众号文章
node dist/cli.js fetch "https://mp.weixin.qq.com/s/xxxxx"

# 搜索最近一周的视频
node dist/cli.js search --week --type video

# 搜索包含"AI"的文章
node dist/cli.js search AI --type article
```

### Claude Code Skill 使用

作为 Claude Code Skill 使用时，直接告诉 Claude：

```
/lingji https://www.youtube.com/watch?v=xxxxx
```

或自然语言指令：
- "帮我保存这个视频"
- "总结这个链接"
- "抓取这个 URL"
- "搜索知识库中的 AI 相关内容"

## 🏗️ 项目架构

```
LingJi-Skill/
├── dist/                    # 编译后的代码
│   ├── cli.js              # CLI 入口
│   ├── fetchers/           # 内容抓取器
│   │   ├── index.js        # 统一抓取入口
│   │   └── generic.js      # 通用网页抓取（Jina Reader）
│   └── lib/                # 核心库
│       ├── douyin.js       # 抖音特殊处理
│       ├── feishu.js       # 飞书 API 封装
│       ├── ffmpeg.js       # ffmpeg 工具
│       ├── gemini.js       # Gemini AI 调用
│       └── ytdlp.js        # yt-dlp 封装
├── package.json
├── SKILL.md                # Claude Code Skill 定义
└── README.md
```

### 核心流程

```
用户输入 URL
    ↓
平台检测 (YouTube/B站/抖音/网页等)
    ↓
┌─────────────────┬─────────────────┐
↓                 ↓                 ↓
视频路径          抖音特殊处理       网页路径
├─ 提取字幕       ├─ 移动端页面抓取   ├─ Jina Reader
├─ 无字幕→音频    ├─ CDN 两步下载法  └─ Gemini 总结
│   → Gemini     └─ ffmpeg 提取音频
└─ 结构化总结       → Gemini 转录
    ↓
飞书多维表格保存
    ↓
返回结构化笔记
```

## 🎯 平台适配详情

| 平台 | 方法 | 状态 |
|------|------|------|
| **YouTube** | yt-dlp 提取字幕/音频 | ✅ 已验证 |
| **B站** | yt-dlp + 直连绕代理 | ✅ 已验证 |
| **抖音** | 两步下载法（移动端页面→CDN）| ✅ 已验证 |
| **微信公众号** | 本地直连抓取 | ✅ 已验证 |
| **普通网页** | Jina Reader | ✅ 已验证 |
| **小红书** | yt-dlp + cookies | ⚠️ 待验证 |
| **微博/知乎/快手** | yt-dlp + 直连 | ⚠️ 待验证 |

### 抖音特殊处理

抖音采用独创的"两步下载法"绕过防盗链机制：

1. 访问移动端分享页面获取视频信息
2. 使用无水印地址（`/play/` 替代 `/playwm/`）
3. 分两步获取 CDN URL（带 Referer 获取 302 地址，再直接下载）
4. ffmpeg 提取音频 → Gemini 转录

### 代理处理

代码已内置智能代理处理：
- 国内平台（B站、抖音等）：自动添加 `--proxy ""` 直连
- 海外平台：使用系统代理

## 🧠 AI 知识框架

灵记使用 Gemini AI 按以下框架提炼知识：

```markdown
## 一句话核心
用一句话（≤40字）说清楚核心主张

## 为什么值得留存
解决什么具体问题？提供什么独特视角？

## 精华洞见
- 【洞见名称】具体说明（含关键细节、数据、步骤）

## 可立即行动的建议
看完后可以直接做的事（1-3条）

## 值得记住的原话或案例
1-2个最值得记住的金句、数据或案例

## 背景标注
- 适合人群：
- 内容类型：
- 标签：

## 完整转录
（仅视频）音频逐字转录
```

## ⚙️ 配置详情

### 必需环境变量

| 变量名 | 用途 | 获取方式 |
|--------|------|----------|
| `GEMINI_API_KEY` | AI 转录和总结 | [Google AI Studio](https://aistudio.google.com/apikey) |
| `FEISHU_APP_ID` | 飞书应用 ID | [飞书开放平台](https://open.feishu.cn/app) |
| `FEISHU_APP_SECRET` | 飞书应用密钥 | [飞书开放平台](https://open.feishu.cn/app) |
| `FEISHU_BITABLE_APP_TOKEN` | 多维表格 App Token | 表格 URL 中提取 |
| `FEISHU_BITABLE_TABLE_ID` | 多维表格 Table ID | 表格 URL 中提取 |

### 飞书应用配置步骤

1. 前往 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用
2. 在「权限管理」中开启：
   - `bitable:app`（多维表格读写）
   - `wiki:wiki:readonly`（知识库读取，可选）
3. 发布应用版本
4. 将应用添加为多维表格协作者（编辑权限）
5. 从表格 URL 提取 App Token 和 Table ID

## 🛠️ 开发说明

### 技术栈

- **运行时**: Node.js 18+ (ES Module)
- **AI 能力**: Google Gemini API (`@google/generative-ai`)
- **视频下载**: yt-dlp (自动下载)
- **音频处理**: ffmpeg
- **知识存储**: 飞书多维表格 API

### 构建

```bash
# 安装依赖
npm install

# TypeScript 编译（如有源码）
npm run build
```

### 调试

```bash
# 设置调试环境变量
export DEBUG=1

# 运行 CLI
node dist/cli.js fetch <URL>
```

## 🤝 贡献指南

欢迎提交 Issue 和 PR！贡献前请阅读以下内容：

1. **Fork 仓库** 并创建特性分支
2. **提交代码** 前确保通过本地测试
3. **创建 PR** 时描述清楚改动内容

### 待办事项

- [ ] 完善小红书、微博、知乎等平台适配
- [ ] 支持更多字幕语言
- [ ] 添加批量导入功能
- [ ] 支持导出 Markdown/Notion

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 视频下载工具
- [Jina Reader](https://jina.ai/reader) - 网页内容提取
- [Google Gemini](https://ai.google.dev/) - AI 能力支持
- [飞书开放平台](https://open.feishu.cn/) - 知识库存储

---

<p align="center">
  Made with ❤️ by EveryReach
</p>
