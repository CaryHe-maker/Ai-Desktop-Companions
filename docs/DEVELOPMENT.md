# 开发说明

## 结构

| 目录 | 内容 |
| --- | --- |
| src | Electron 主进程、网页视图、聊天 UI、动画播放 |
| assets/v3 | 原有关键帧与补间，部分动作仍使用 |
| assets/v4 | 每个角色 64 张日常动作 |
| assets/v5 | 开场新增帧及当前清单 |
| scripts | 打包、激活、测试和可选素材工具 |
| tests | 不访问真实模型的自动测试 |

Node.js 最低 22.12，推荐 24 LTS。Windows 10/11 x64 为当前支持环境。通过 `npm ci` 安装锁定依赖；运行不需要 Python、图像模型或重新生成美术。密钥通过应用设置输入。

主进程位于 `src/main.cjs`。预加载桥仅暴露受限 IPC；渲染器保留沙箱和上下文隔离，不启用 Node 集成。官网网页会话与本地聊天分别隔离。

## 动画维护

运行清单为 `src/animation-assets.js`，当前 JSON 源清单为 `assets/v5/manifest.json`。`pet-motion.js` 控制时间轴和帧解析，`pet.js` 使用 Canvas 绘制并控制窗口移动。数值型帧对表示原补间数量；数组型帧对用于保留原图并插入新图。`files` 字段提供新增资源的相对路径。

每个角色在原开场序列中新增 10 帧。行走保留原来的 8 张完整角色关键帧、补间和播放节奏，不使用拆分腿部模板。

仓库分发已生成的运行资源；`assets/source/` 本机生成记录及参考下载不提交。`prepare-v*.cjs` 等为**可选素材工具**，需自行准备匹配的图集，不属于初次安装步骤。历史 Python 光流工具需要自备 Python、NumPy、OpenCV；默认运行和测试不依赖它们。

公开提示词见 `docs/IMAGE_PROMPTS.json`，已去除本机路径和生成会话标识。美术权利说明见 `ASSET_NOTICE.md`。

## 验证与发布

- `npm test`：动画路径、帧数、原版行走保留、几何和模拟服务响应。
- `npm run test:ui`：实际 Windows 角色、会话、窗口层级及渲染隔离。
- `npm run test:animation`：帧率及原生窗口移动稳定性。
- `node scripts/check-web-chat.cjs`：本地示例网页，不需官网登录。
- `npm run check:release`：扫描 Git 索引中的文件名、常见密钥形态及本机用户路径，仅输出位置和类别。

UI 检查需要交互式 Windows 桌面。受限执行环境可能阻止 Electron 子进程读取运行库；不要因此关闭产品沙箱。CI 默认执行不需要桌面的单元测试和发布检查。

打包使用运行文件白名单，排除环境变量、用户资料、Git 元数据和缓存。先写 `.cache/staged/`，测试后激活到 `dist/`。

发布流程：暂存需要的文件 → 发布检查 → 自动测试 → 人工审阅 diff → 提交。忽略规则不能保护已经跟踪的文件。
