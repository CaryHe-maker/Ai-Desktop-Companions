# AI Desktop Companions · 桌面 AI 小伙伴

一个面向 **Windows 桌面**的 Electron 桌面宠物项目，使用中文社区常见的 **DeepSeek、Claude、ChatGPT 动漫拟人形象**，让三位小伙伴在桌面上走动、打招呼，并提供独立的对话窗口。

> **素材说明：本项目中的动作与房屋等素材均由 GPT 生成；最初的 PNG 角色参考图来自互联网。** 动画播放、补间与窗口移动由程序实现。本项目并非 OpenAI、Anthropic 或 DeepSeek 官方产品，与相关公司无隶属或背书关系。原始角色图的作者和授权尚未完整核实；**如有侵权，请通过 [GitHub Issues](https://github.com/CaryHe-maker/Ai-Desktop-Companions/issues) 联系，维护者将在核实后删除相关素材。** 代码开源许可不代表拥有角色、美术素材或商标的授权，详见 [素材来源与权利说明](ASSET_NOTICE.md)。

## 功能

- 三个透明桌面角色：GPT 月光、Claude 暖书、DeepSeek 海汐。
- 角色保持置顶；点击打开的聊天窗口遵循普通窗口层级，可被其他应用覆盖。
- 小屋出场、整帧行走、眨眼、挥手、鞠躬、伸懒腰、休息、拖动与落地动作。
- GPT 行走使用 8 张侧向完整角色帧：4 张左脚领先、4 张右脚领先，交替换脚；Claude 保留原行走素材。
- ChatGPT、Claude、DeepSeek 均使用各自官网的内嵌网页，登录自己的账号即可聊天。
- 模型选择、历史记录、附件、联网、停止和重试均使用官网原生功能，以各服务当前提供的能力为准。
- 当前走路、左右看看、轻轻鞠躬、摆手问好已在上一版基础上加速 50%；行走动画与桌面移动同步。伸懒腰及其他动作保持上一版速度。
- 自动动作结束后随机休息 12–36 秒；三位角色独立抽选动作和间隔，避免连续重复同一个动作。
- 仓库不包含作者的登录状态或聊天记录。

## 快速开始

需要 **Windows 10 / 11 x64、Git 和网络连接**。克隆后双击根目录的 **`install.exe`**，即可安装运行依赖并创建桌面快捷方式。

```powershell
git clone https://github.com/CaryHe-maker/Ai-Desktop-Companions.git
cd Ai-Desktop-Companions
./install.exe
```

安装器先列出下载内容：缺少兼容环境时下载 Node.js 24 LTS 便携版，随后安装锁文件中的 npm 依赖与 Electron。点击 **“同意并安装”** 后才开始，完成后在桌面生成 **GPT、Claude、DeepSeek** 三个快捷方式；点击“取消”直接退出。

安装在当前项目文件夹内完成，无需管理员权限；建议放在可写的普通用户目录，预留约 2 GB 空间。安装后保留此文件夹。已有兼容 Node.js 的开发者也可运行 `npm ci`、`npm start`（最低 Node.js 22.12）。PowerShell 拦截 `npm.ps1` 时改用 `npm.cmd`。详见 [Windows 安装说明](docs/INSTALL.md)。

**克隆后可直接运行，无需 Python、图像生成服务或作者的本地缓存。** 运行时图片随仓库提供；重新生成美术素材是可选的开发工作。

## 基本操作

| 操作 | 效果 |
| --- | --- |
| 点击角色 | 打开对应聊天窗口 |
| 按住角色拖动 | 调整桌面位置 |
| 右键角色 | 打开动作和设置菜单 |
| 鼠标移到角色上方 | 显示快捷操作条 |
| 托盘图标 | 召唤角色、归位、退出程序 |
| 关闭聊天窗口 | 隐藏聊天，不退出角色 |

三位角色首次使用均需在官方页面自行登录：

| 角色 | 官方聊天网站 |
| --- | --- |
| GPT | [ChatGPT](https://chatgpt.com/) |
| Claude | [Claude](https://claude.ai/new) |
| DeepSeek | [DeepSeek](https://chat.deepseek.com/) |

应用会话独立于 Chrome / Edge；官方验证、订阅、权限及用量限制照常适用。若内嵌登录受限，可使用“在浏览器中打开”。本项目已移除本地 API 调用、密钥设置和本地会话界面，无需配置 API Key 或 `.env`。

详细设置、数据位置及故障排查见 [使用说明](docs/USAGE.md)。

## 打包为便携程序

```powershell
npm run package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/activate-build.ps1
```

打包先写入 `.cache/staged/Deskbot-win32-x64/`；激活后运行 `dist/Deskbot-win32-x64/Deskbot.exe`，保留同目录全部文件。首次克隆没有现成 exe，需要先打包。

升级前请从托盘退出旧程序。激活脚本会迁移旧版 `data/` 并备份旧程序；不要分发自己的数据目录。可选运行 `scripts/windows/install-shortcuts.ps1` 创建桌面快捷方式。

## 开发与依赖

```powershell
npm test                  # 单元与动画测试，不请求真实模型
npm run test:ui           # 三个官网窗口及渲染隔离检查
npm run test:web          # 官网页面、登录页及 Cookie 保持检查
npm run test:animation    # 动画帧率与窗口移动检查
npm run test:layers       # Windows 原生遮挡顺序、恢复及焦点检查
npm run check:release     # 检查 Git 索引中的发布文件
```

| 依赖 | 用途 |
| --- | --- |
| Electron | 桌面窗口、托盘、隔离的官方网页视图 |
| @electron/packager | Windows x64 打包 |
| sharp | 图片裁切、图集、图标与预览处理 |
| Playwright | Electron 窗口和动画自动检查 |

具体版本由 `package-lock.json` 锁定。Linux/macOS 尚未验证；当前打包目标为 Windows x64。见 [开发说明](docs/DEVELOPMENT.md)。

目录用途及本次整理记录见 [项目目录说明](docs/PROJECT_LAYOUT.md)。`install.exe` 的源码位于 `installer/`，可运行 `npm run build:installer` 重新编译。

## 隐私与贡献

`.gitignore` 排除应用数据、登录会话、环境变量、凭据、缓存及本机参考图。**忽略规则不能撤回已提交的秘密**；提交前请运行发布检查并人工检查 diff。详见 [SECURITY.md](SECURITY.md)。

欢迎提交问题和补丁，见 [CONTRIBUTING.md](CONTRIBUTING.md)。代码采用 [MIT License](LICENSE)；美术、角色、品牌标识及第三方依赖的权利与许可单独适用。
