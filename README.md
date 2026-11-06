# animation-2d

让 agent 把角色图片生成 Spine 动画，支持待机、眨眼和骨骼形变，
导出 JSON / atlas / PNG，并提供本地网页预览。

## 安装

### 直接发送给 agent 安装

复制以下内容发送给你的 agent：

```text
请安装 https://github.com/youtiaoguagua/animation-2d 中的 spine-animation skill。
使用 skills CLI 安装到你自己的用户级技能目录，准备 Node.js 22.20+ 和 pnpm。
安装后按 SKILL.md 运行环境自检，修复基础生成与预览所需依赖，并报告安装结果。
```

### 手动安装

准备 Node.js 22.20+ 和 pnpm。以下以 Codex 为例：

```bash
npx skills add youtiaoguagua/animation-2d --skill spine-animation --agent codex -g
pnpm --dir ~/.agents/skills/spine-animation --ignore-workspace install --prod --frozen-lockfile
node ~/.agents/skills/spine-animation/scripts/spine.mjs doctor --segmentation mesh --preview
```

其他 agent 可替换 `--agent codex`，并使用对应技能目录执行依赖安装和自检。

## 使用

附上角色图片并发送：

```text
$spine-animation 将这张角色图做成 2 秒循环待机动画，头部轻摆、双眼眨眼，
优先透明整图蒙皮，导出 Cocos Creator 3.8 并打开预览。
```

基础功能无需 Python 或单独的模型 API Key，SAM 分割按需启用。
详细用法见[技能说明](skills/spine-animation/SKILL.md)和[抠图与透明素材说明](skills/spine-animation/references/cutouts.md)。
可编辑的 `.spine` 文件另需已授权的 Spine 编辑器。

## 开发

```bash
git clone https://github.com/youtiaoguagua/animation-2d.git
cd animation-2d
pnpm install
pnpm run doctor
pnpm agent:check
pnpm test
pnpm demo
```

`pnpm demo` 生成带眨眼的待机示例并返回预览链接，服务会持续运行。
重新打开已有作品：`pnpm preview --output ./output`。

修改 `agent/`、`server/` 或 `web/` 中的源码后，更新并提交技能分发文件：

```bash
pnpm skill:prepare  # 更新供 skills 安装的分发文件
pnpm skill:install  # 安装到本机
pnpm skill:pack     # 生成 dist/ 下的独立安装包
```

示例素材位于 `assets/demo/`，出拳动作规划与分层示例位于 `plans/character-punch/`。

使用 [Apache-2.0](LICENSE) 许可证，保留原有 [NOTICE](NOTICE)。
