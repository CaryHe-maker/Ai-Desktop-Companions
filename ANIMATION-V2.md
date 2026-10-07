# 桌面宠物动画更新

默认角色高度约 112 个 Windows 逻辑像素，为原先的一半；设置里的大小范围为 30%～85%，默认 50%。门与角色一起缩小，聊天窗口和按钮仍保持可读。

三只宠物各有 40 张动作画面：16 张出门帧、8 张走路帧、4 张专属动作、4 张挥手帧，以及 8 张基础表情／姿态。出门过程包含探头、扶住门框、跨门槛、逐级落脚和打招呼。GPT 使用月牙拱门，Claude 使用向日葵木门，DeepSeek 使用贝壳门。

鼠标移到宠物上可点击挥手、专属动作和睡觉按钮；右键菜单可散步或重新播放出场。GPT 会整理头发和行礼，Claude 会翻书，DeepSeek 会抱小鲸鱼。空闲时也会随机做动作。

动画按固定角色高度和脚底基线播放，不再根据窗口实时宽度缩放。Windows 首次显示、散步和拖动均明确设置窗口尺寸，避免原生 DPI 尺寸舍入累积。测试环境为 Windows 150% 显示缩放；不同缩放比例的多屏切换仍需实际设备验证。

动态预览（浏览器打开）：

- [GPT](artifacts/animation-v2/gpt-preview.webp)
- [Claude](artifacts/animation-v2/claude-preview.webp)
- [DeepSeek](artifacts/animation-v2/deepseek-preview.webp)

素材为逐帧二维动画，使用关键帧与短暂过渡；不是骨骼绑定或三维模型。新的源图和整理后的帧分别位于 `assets/source/v2/` 和 `assets/v2/`。生成规格记录在 `assets/prompts-v2.json`。

开发检查：

```powershell
npm.cmd test
node scripts/smoke.cjs
node scripts/check-animation.cjs
node scripts/record-animation.cjs
```

打包改为先输出到 `.cache/staged/Deskbot-win32-x64/`，不会覆盖正在使用的版本。退出托盘中的 Deskbot 后执行以下命令，安装脚本会复制原有 `data` 并将旧版本保留在 `.cache/releases/`：

```powershell
npm.cmd run package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/activate-build.ps1
```

最终程序路径和三个桌面快捷方式保持原位置。登录状态、密钥和聊天数据随 `data` 一起保留。
