# 开发说明

## 结构

| 目录 | 内容 |
| --- | --- |
| src | Electron 主进程、网页视图、聊天 UI、动画播放 |
| assets/v3 | 原有关键帧与补间，部分动作仍使用 |
| assets/v4 | 每个角色 64 张日常动作 |
| assets/v5 | 开场新增帧及历史清单 |
| assets/v6 | DeepSeek 完整角色换脚行走帧、三位角色清理后的休息帧及历史清单 |
| assets/v7 | GPT 侧向左右脚交替行走帧及当前清单 |
| scripts/assets | 可选的图片裁切、补间和素材维护工具 |
| scripts/checks | UI、动画、随机调度、安装器和发布检查 |
| scripts/build | Electron 打包及运行文件白名单 |
| scripts/windows | 安装、激活、快捷方式及安装器编译 |
| installer | install.exe 的 C# 源码和 Windows manifest |
| docs/prompts / docs/archive | 绘制提示词及旧版本动画记录 |
| tests | 不访问真实模型的自动测试 |

Node.js 最低 22.12，推荐 24 LTS。Windows 10/11 x64 为当前支持环境。通过 `npm ci` 安装锁定依赖；运行不需要 Python、图像模型或重新生成美术。三位角色均在隔离的官方网页会话中登录，无需 API 密钥。

主进程位于 `src/main.cjs`。预加载桥仅暴露窗口、设置和网页操作 IPC；渲染器保留沙箱和上下文隔离，不启用 Node 集成。三家官网使用不同的持久化会话分区。旧 API 发送、OAuth 适配器、本地会话模块及其依赖已移除。

## 动画维护

`pet.js` 的 `AMBIENT_INTERVAL` 为 12000 ms；`ambientDelay()` 每次均匀抽取 t 到 3t 的间隔。初始化、手动动作及返回 idle 时更新下一次自动动作时间，动作结束后的完整等待时间不会被动作播放消耗。每个角色窗口独立抽选，并从可用动作中排除上一次自动动作；关闭闲逛时同时排除 walk。不要在 `updateAmbient()` 抽选后写入固定等待时间，否则会覆盖随机调度。

运行清单为 `src/animation-assets.js`，当前 JSON 源清单为 `assets/v7/manifest.json`。`pet-motion.js` 控制时间轴和帧解析，`pet.js` 使用 Canvas 绘制并控制窗口移动。数值型帧对表示原补间数量；数组型帧对用于保留原图并插入新图。`files` 字段提供新增资源的相对路径。

每个角色在原开场序列中新增 10 帧。GPT 和 DeepSeek 行走采用 8 张重绘的完整角色帧，不使用拆分腿部模板。GPT 的 m0..m3 为近侧左脚领先，m4..m7 为远侧右脚领先，鞋尖朝向侧面移动方向；向右移动时镜像整个角色。对应旧行走补间不再加载，避免混回单脚姿势。Claude 保留原行走素材。三位角色的 walk、look、bow、greet 在上一版基础上加速 50%；walk 从 9840 ms 变为 6560 ms，后三者从 3980 ms 变为约 2653.33 ms。`WALK_SPEED` 同步缩短行走帧间隔和加减速时间，并提高桌面移动速度；伸懒腰仍为 3980 ms，其余动作的时间轴不变。

`clean-rest-sprites.cjs` 清理原图集裁切遗留的相邻发丝，保留休息角色原始像素与坐标。素材维护顺序为 `prepare-v6.cjs`、`clean-rest-sprites.cjs`、`prepare-v7.cjs`；v7 从 v6 继承其余资源，仅替换 GPT 行走。v7 工具需要本地 `assets/source/v7/gpt-left-phases.png` 和 `gpt-right-phases.png` 两张透明 2×2 图集，提取每格完整角色的连通轮廓，排除轮廓外的独立杂点，并统一尺寸和脚底基线；保留人物内部的颜色和透明度，不拆分腿部。

仓库分发已生成的运行资源；`assets/source/` 本机生成记录及参考下载不提交。`prepare-v*.cjs` 等为**可选素材工具**，需自行准备匹配的图集，不属于初次安装步骤。历史 Python 光流工具需要自备 Python、NumPy、OpenCV；默认运行和测试不依赖它们。

公开提示词见 `docs/prompts/IMAGE_PROMPTS.json`；历史完整人物换脚提示词见 `docs/prompts/WALK_PROMPTS.json`，GPT 侧向换脚提示词见 `docs/prompts/SIDE_WALK_PROMPTS.json`。均已去除本机路径和生成会话标识。美术权利说明见 `ASSET_NOTICE.md`。

## 验证与发布

- `npm test`：动画路径、帧数、指定动作加速和伸懒腰速度保持、休息帧清理、几何及官网导航规则。
- `npm run test:ui`：实际 Windows 角色、三个官网聊天窗口及渲染隔离。
- `npm run test:web`：三家官网的本地页面替身、登录页、样式开关及 Cookie 保持。
- `npm run test:animation`：帧率及原生窗口移动稳定性。
- `npm run test:layers`：独立普通窗口与三个聊天窗口的原生 Windows 前后顺序，含最小化恢复及角色不抢键盘焦点检查。
- `npm run test:ambient`：三个角色分别随机等待 12–36 秒，动作不连续重复，手动响应和暂停条件。
- `npm run build:installer`：使用 Windows 自带 .NET Framework C# 编译器生成根目录 install.exe；不依赖新增编译工具。
- `npm run test:installer`：真实 Windows 确认界面、下载说明、取消及无确认调用检查。
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/checks/check-installer.ps1 -FullInstall`：在隔离的中文/空格路径测试副本中，经界面确认后安装便携 Node、npm 依赖及 Electron，打包并验证三个测试快捷方式；需要联网，不修改真实桌面的快捷方式。
- `node scripts/checks/check-web-chat.cjs`：本地示例网页，不需官网登录。
- `npm run check:release`：扫描 Git 索引中的文件名、常见密钥形态及本机用户路径，仅输出位置和类别。
- `npm run check:release -- --working-tree`：在暂存前检查当前改动与未忽略的新文件，不修改 Git 索引。

UI 检查需要交互式 Windows 桌面。受限执行环境可能阻止 Electron 子进程读取运行库；不要因此关闭产品沙箱。CI 默认执行不需要桌面的单元测试和发布检查。

打包使用运行文件白名单，排除环境变量、用户资料、Git 元数据和缓存。先写 `.cache/staged/`，测试后激活到 `dist/`。

角色使用置顶层，聊天及官网登录弹窗使用普通窗口层。聊天打开或恢复时只调整角色的前后顺序，不聚焦角色；首次显示采用一次性入口，避免页面加载完成后再次弹到前面。API 行为参考 [Electron BrowserWindow 文档](https://www.electronjs.org/docs/latest/api/browser-window/)。

发布流程：暂存需要的文件 → 发布检查 → 自动测试 → 人工审阅 diff → 提交。忽略规则不能保护已经跟踪的文件。
