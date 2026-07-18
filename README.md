# YunTerminal

现代化跨平台终端与远程连接管理工具。在一个桌面应用内统一管理 SSH、Telnet、VNC、RDP、本地终端、SFTP、端口转发与运维辅助能力。

## 功能特性

### 连接与协议

- **SSH**：应用内 xterm 终端；密码 / 私钥 / 交互式认证 / 每次询问 / 凭证库引用
- **跳板与代理**：多级 SSH 跳板链；SOCKS4/5、HTTP/HTTPS 代理
- **SFTP**：双栏本地 ↔ 远程文件管理，拖拽传输、在线编辑、chmod
- **Telnet**：应用内终端，支持登录交互与凭证
- **VNC**：主进程 WebSocket 代理 + noVNC 远程桌面
- **RDP**：调用系统客户端（Windows `mstsc` / macOS `rdp://` / Linux FreeRDP）
- **本地终端**：优先 `node-pty`（Windows 默认 PowerShell），失败时回退 `child_process`
- **连接管理**：分组树、收藏、最近连接、标签与备注、导入/导出（可选含密钥）
- **独立凭证库**：密码与私钥集中管理，连接可复用凭证

### 运维与效率

- **端口转发**：本地 / 远程 / 动态（SOCKS5）隧道，支持自动启动与重连
- **远程监控**：经 SSH 采集 CPU、内存、磁盘、网络、进程等指标并图表展示
- **连接笔记**：按连接存储 Markdown，编辑 / 预览 / 分栏，自动保存
- **快速命令**：全局或绑定连接的命令模板，一键发送到当前终端
- **会话录制**：录制 SSH / 本地 / Telnet 会话（`.yrec`）并回放
- **AI 助手**：兼容 OpenAI / Ollama 等 Chat Completions API；对话、解释命令、生成命令、诊断错误

### 体验与安全

- 多会话 Tab、同连接多终端子 Tab、无边框自定义标题栏
- 5 套应用主题 + 5 套终端配色，可调字体与字号
- 终端内搜索、命令历史面板
- 应用级密码锁（空闲超时 / 启动锁定）；敏感凭据使用 Electron `safeStorage` 加密存储

### 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` | 新建连接 |
| `Ctrl+W` | 关闭当前终端 |
| `Ctrl+Tab` | 切换会话 |
| `Ctrl+F` | 终端内搜索 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+Shift+I` | AI 助手 |
| `Ctrl+Shift+R` | 命令历史 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端 | React 19 + TypeScript + Tailwind CSS |
| 状态管理 | Zustand |
| 终端 UI | xterm.js |
| 协议实现 | ssh2 / telnet-client / @novnc/novnc / socks / ws |
| 本地 PTY | node-pty |
| 构建 | electron-vite + Vite 6 + electron-builder |

## 环境要求

- **Node.js** 22+（推荐）
- **包管理器**：npm
- **RDP（可选）**：Windows 自带远程桌面；Linux 需安装 FreeRDP（如 `freerdp2-x11`）
- **远程监控**：依赖目标主机可通过 SSH 执行采集脚本（主要面向 Linux / macOS）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 仅构建（输出到 out/）
npm run build
```

## 打包发布

```bash
# 当前平台
npm run dist

# 指定平台
npm run dist:win    # Windows NSIS 安装包
npm run dist:mac    # macOS DMG
npm run dist:linux  # Linux AppImage + deb
```

产物输出到 `release/`。

应用图标放置于 `build/` 目录（详见 [`build/README.md`](build/README.md)）：

- Windows：`icon.ico`
- macOS：`icon.icns`
- Linux：`icon.png`（建议 512×512+）

> Windows 打包已配置 `npmRebuild: false`，使用 `node-pty` 自带的 N-API prebuilds，无需安装 Visual Studio Build Tools。

## 项目结构

```
YunTerminal/
├── electron/
│   ├── main/           # 主进程：协议实现、IPC、数据存储
│   └── preload/        # contextBridge 暴露给渲染进程的 API
├── src/
│   ├── renderer/       # React 界面（连接、终端、SFTP、隧道等）
│   └── shared/         # 共享类型与 IPC 通道定义
├── build/              # 打包资源（图标等）
├── out/                # electron-vite 构建产物
├── release/            # 安装包输出
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

## 数据与安全

用户数据保存在 Electron `userData` 目录下，主要包括：

- 连接与分组、凭证库、设置、隧道、笔记、快速命令、AI 配置
- 会话录制文件（`.yrec`）

凭据等敏感字段优先使用系统级 `safeStorage` 加密；应用锁屏密码使用 scrypt 哈希。主进程开启 `contextIsolation`，渲染进程不启用 `nodeIntegration`。

## 开发脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览构建结果 |
| `npm run dist` / `dist:win` / `dist:mac` / `dist:linux` | 打包 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 |

## License

MIT
