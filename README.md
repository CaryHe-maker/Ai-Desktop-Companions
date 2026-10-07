# AI Desktop Companions · 桌面 AI 小伙伴

一个面向 **Windows 桌面**的 Electron 桌面宠物项目，使用中文社区常见的 **DeepSeek、Claude、ChatGPT 动漫拟人形象**，让三位小伙伴在桌面上走动、打招呼，并提供独立的对话窗口。

> **素材说明：本项目中的动作与房屋等素材均由 GPT 生成；最初的 PNG 角色参考图来自互联网。** 动画播放、补间、骨骼合成与窗口移动由程序实现。本项目并非 OpenAI、Anthropic 或 DeepSeek 官方产品，与相关公司无隶属或背书关系。原始角色图的作者和授权尚未完整核实；**如有侵权，请通过 [GitHub Issues](https://github.com/CaryHe-maker/Ai-Desktop-Companions/issues) 联系，维护者将在核实后删除相关素材。** 代码开源许可不代表拥有角色、美术素材或商标的授权，详见 [素材来源与权利说明](ASSET_NOTICE.md)。

## 功能

- 三个透明桌面角色：GPT 月光、Claude 暖书、DeepSeek 海汐。
- 角色保持置顶；点击打开的聊天窗口遵循普通窗口层级，可被其他应用覆盖。
- 小屋出场、双腿交替行走、眨眼、挥手、鞠躬、伸懒腰、休息、拖动与落地动作。
- GPT / Claude 使用各自官网的内嵌网页；DeepSeek 使用用户自行配置的 API Key。
- DeepSeek 支持本地多会话、流式回复、图片输入入口、搜索摘要、停止和重试；实际模型能力与接口可用性取决于服务商。
- 仓库不包含作者的 API Key、登录状态或聊天记录。

## 快速开始

需要 **Windows 10 / 11 x64、Git、Node.js 24 LTS（附带 npm）**。最低 Node.js 版本为 22.12。首次安装需要联网下载 npm 依赖和 Electron。

```powershell
git clone https://github.com/CaryHe-maker/Ai-Desktop-Companions.git
cd Ai-Desktop-Companions
npm ci
npm start
```

PowerShell 如果提示 `npm.ps1` 无法运行，将 `npm` 换成 `npm.cmd`。建议使用可写的普通用户目录，不要放在 Program Files 中。

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

GPT / Claude 首次使用需在其官方页面自行登录。应用会话独立于 Chrome / Edge；官方验证、订阅、权限及用量限制照常适用。若内嵌登录受限，可使用“在浏览器中打开”。

DeepSeek：点击蓝色角色 → 设置 → 输入自己的 API Key → 保存。密钥只在本机使用，不需要修改代码或填写 `.env`。API 请求由用户自己的账户承担；本项目不提供共享密钥。

详细设置、数据位置及故障排查见 [使用说明](docs/USAGE.md)。

## 打包为便携程序

```powershell
npm run package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/activate-build.ps1
```

打包先写入 `.cache/staged/Deskbot-win32-x64/`；激活后运行 `dist/Deskbot-win32-x64/Deskbot.exe`，保留同目录全部文件。首次克隆没有现成 exe，需要先打包。

升级前请从托盘退出旧程序。激活脚本会迁移旧版 `data/` 并备份旧程序；不要分发自己的数据目录。可选运行 `scripts/install-shortcuts.ps1` 创建桌面快捷方式。

## 开发与依赖

```powershell
npm test                  # 单元与动画测试，无需 API Key
npm run test:ui           # Windows 窗口、会话及层级检查
npm run test:animation    # 动画帧率与窗口移动检查
npm run check:release     # 检查 Git 索引中的发布文件
```

| 依赖 | 用途 |
| --- | --- |
| Electron | 桌面窗口、托盘、网页视图、系统凭据加密 |
| @electron/packager | Windows x64 打包 |
| sharp | 图片裁切、图集、图标与预览处理 |
| Playwright | Electron 窗口和动画自动检查 |
| fast-xml-parser | 搜索 RSS 摘要解析 |
| jose | 旧版认证模块的令牌验证；默认 GPT 路径使用官网网页 |

具体版本由 `package-lock.json` 锁定。Linux/macOS 尚未验证；当前打包目标为 Windows x64。见 [开发说明](docs/DEVELOPMENT.md)。

## 隐私与贡献

`.gitignore` 排除应用数据、登录会话、环境变量、凭据、缓存及本机参考图。**忽略规则不能撤回已提交的秘密**；提交前请运行发布检查并人工检查 diff。详见 [SECURITY.md](SECURITY.md)。

欢迎提交问题和补丁，见 [CONTRIBUTING.md](CONTRIBUTING.md)。代码采用 [MIT License](LICENSE)；美术、角色、品牌标识及第三方依赖的权利与许可单独适用。
