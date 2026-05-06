# ClaudeCLI2UI for Windows

基于 [@cloudcli-ai/cloudcli](https://www.npmjs.com/package/@cloudcli-ai/cloudcli) 的 Claude Code 网页界面封装，提供浏览器端的 Claude Code 交互体验。

> **注意：** 底层包已从 `@siteboon/claude-code-ui` 迁移至 `@cloudcli-ai/cloudcli`。
> `@siteboon/claude-code-ui@2.0.0` 是空壳包，Web UI 内更新后会变成空壳，导致"更新成功但重启后版本未变"。
> 本仓库已完成迁移，直接使用新包。

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务（前台）
npm start
```

Windows 下推荐双击 `start-claudecodeui.vbs` 静默后台启动（无窗口）。

启动后访问 **http://localhost:3001**，默认账号 `admin / admin123`。

## 启动方式

| 方式 | 说明 |
|------|------|
| `start.bat` | 后台启动（最小化窗口） |
| `start-claudecodeui.vbs` | **静默启动**，完全无窗口，适合开机自启 |
| `npm start` | 前台启动（终端可见） |

## 重启方式

| 方式 | 说明 |
|------|------|
| `restart.bat` | 一键重启（会弹出终端窗口） |
| `restart-claudecodeui.vbs` | **静默重启**，完全无窗口，双击即可 |

> 看门狗（`watch-restart.js`）会在服务器意外退出时自动重启，确保服务稳定运行。

## 更新与重启

### 命令行更新

```bash
npm install @cloudcli-ai/cloudcli@latest
```

### Web UI 内更新

在 Web UI 设置页点击更新后，手动运行重启：

```bash
# 双击 restart.bat（推荐，一键完成）
# 或手动步骤：

# 1. 查找并杀掉旧进程
netstat -ano | findstr ":3001"
# 记下 PID，然后 taskkill /f /pid <PID>

# 2. 双击 start-claudecodeui.vbs 重新启动
```

## 常见问题

### Web UI 更新成功但版本未变

**根因：** 依赖包已从 `@siteboon/claude-code-ui` 迁移至 `@cloudcli-ai/cloudcli`。Web UI 的自动更新会安装 `@siteboon/claude-code-ui@2.0.0`，该版本只是一个空壳（仅 88 字节），声明 "This package has moved to @cloudcli-ai/cloudcli"。真正的代码在新包名下。

**修复：**

```bash
# 更换为新包
npm uninstall @siteboon/claude-code-ui
npm install @cloudcli-ai/cloudcli
```

然后更新启动脚本中的路径：
- `node_modules\@siteboon\claude-code-ui\server\index.js`
- → `node_modules\@cloudcli-ai\cloudcli\dist-server\server\index.js`

或者直接拉取本仓库最新代码，已包含所有修复。

### 手动强制更新

```bash
# 如果 npm install 失败，使用 --force
npm install @cloudcli-ai/cloudcli@latest --force
```

### 端口被占用

如果 3001 端口被其他程序占用：

1. 找到占用进程：`netstat -ano | findstr ":3001"`
2. 杀掉进程：`taskkill /f /pid <PID>`
3. 或双击 `restart.bat` 自动处理

### GitHub 推送被拒 (GH007)

```text
remote: error: GH007: Your push would publish a private email address.
```

GitHub 开启了"阻止推送暴露私人邮箱"的保护。解决方法：

```bash
# 将 git 邮箱修改为 GitHub 的 noreply 地址
# 用户 ID 可通过 https://api.github.com/users/你的用户名 查询
git config user.email "45386748+kany2000@users.noreply.github.com"
git commit --amend --author="kany2000 <45386748+kany2000@users.noreply.github.com>" --no-edit
```

## 局域网访问

同一局域网内的其他设备（Windows / Mac / Linux / 手机）可以通过浏览器访问本服务。

```bash
# 1. 以管理员身份运行以下脚本（只需执行一次）
enable-lan-access.bat

# 2. 查看本机局域网 IP
ipconfig | findstr IPv4

# 3. 其他设备在浏览器中访问
#    http://<你的局域网IP>:3001
```

脚本会添加 Windows 防火墙规则，允许局域网设备访问端口 3001。  
如果切换了网络环境（如从家里到公司），需要重新查看本机 IP。

### 静默启动不生效

开机启动目录：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`

确保该目录下有 `ClaudeCodeWebUI.vbs` 文件。

## 项目结构

```
claudecli2ui/
├── package.json                # 项目配置
├── start.bat                   # 后台启动脚本
├── start-claudecodeui.bat      # 直接启动脚本
├── start-claudecodeui.vbs      # 静默启动脚本（推荐）
├── restart.bat                 # 一键重启脚本（有窗口）
├── restart-claudecodeui.vbs    # 静默重启脚本（推荐）
├── enable-lan-access.bat       # 局域网访问设置
├── watch-restart.js            # 看门狗（自动重启）
├── project/                    # 工作区目录
└── node_modules/               # 依赖包
```

## 相关链接

- [@cloudcli-ai/cloudcli](https://www.npmjs.com/package/@cloudcli-ai/cloudcli) - 底层 UI 包（新）
- [CloudCLI](https://cloudcli.ai) - 官方主页
- [Claude Code](https://claude.ai) - Anthropic 官方 CLI 工具
