# animation-2d

由 agent 规划图片的部件和动作，在本地生成 Spine 动画、导出引擎资源并打开预览。
项目包含 skill 源码、TypeScript 命令行、图像/骨骼核心、可选 SAM 桥接、预览页面和测试。

基础功能使用 Node.js 20.9+，运行依赖为 Sharp、Express，开发和安装使用 pnpm。
图片理解与动作方案由调用 skill 的 agent 完成，运行工具无需另外配置模型 API Key。

## 开发与演示

```bash
pnpm install
pnpm run doctor
pnpm agent:check
pnpm test
pnpm demo
```

`pnpm demo` 使用 `assets/demo/` 的原图、部件方案和动作方案生成眨眼待机动画，
随后返回预览链接。预览服务会在命令退出后继续运行；端口被占用时会选择可用端口。

`output/` 保存本机生成的作品，`plans/character-punch/` 提供出拳动作的规划与分层构建示例。
重新打开已有作品：

```bash
pnpm preview --output ./output
```

网页支持作品切换、原图对照、循环播放、逐帧、深浅/棋盘背景、骨骼显示和下载。

## 使用 skill

通过 [skills CLI](https://github.com/vercel-labs/skills) 安装到 Codex（需要 Node.js 22.20+ 和 pnpm）：

```bash
npx skills add youtiaoguagua/animation-2d --skill spine-animation --agent codex -g
```

安装后让 agent 执行技能中的环境自检，并按 `repairs` 安装缺失依赖。
也可以手动准备依赖并验证：

```bash
pnpm --dir ~/.agents/skills/spine-animation --ignore-workspace install --prod --frozen-lockfile
node ~/.agents/skills/spine-animation/scripts/spine.mjs doctor --segmentation mesh --preview
```

`skills/spine-animation/` 包含编译后的程序、预览资源和生产依赖锁文件，
安装后可独立于源码仓库运行。安装到其他 agent 时替换 `--agent`，并按其技能目录运行命令。

从已安装依赖的源码项目直接安装：

```bash
pnpm skill:install
```

安装后在 Codex 中附上图片并输入：

```text
$spine-animation 将这张角色图做成2秒循环待机动画，头部轻摆、双眼眨眼，
优先透明整图蒙皮，导出Cocos Creator 3.8并打开预览。
```

[技能说明](skills/spine-animation/SKILL.md)要求先进行环境自检，再按当前任务修复并复检。
其他 agent 可读取同一份 `SKILL.md`，执行相同命令。

```bash
node skills/spine-animation/scripts/spine.mjs doctor --segmentation mesh --output ./output --preview
node skills/spine-animation/scripts/spine.mjs --help
```

源码运行和安装后的技能都支持从其他工作目录调用；输入和输出路径按调用者的目录解析。

## 构建与分发

修改运行代码、预览页或 SAM 脚本后，先更新并提交 skill 目录中的分发文件，
让 `skills add` 安装到最新版本：

```bash
pnpm skill:prepare
```

分发文件由打包脚本生成；在 `agent/`、`server/`、`web/` 中修改源码，再重新生成。
打包为独立目录或压缩包：

```bash
pnpm skill:build
pnpm skill:pack
```

生成 `dist/spine-animation/` 和 `dist/spine-animation-skill-0.1.0.tgz`，其中包含
编译后的 JavaScript、预览资源、可选 SAM 脚本、技能说明和生产依赖锁文件。
在目标 agent 的技能目录解压后运行 `pnpm install --prod` 即可准备运行依赖。

`pnpm skill:install --target /path/to/skills/spine-animation` 可安装到指定目录。
修改源码后重新构建/安装以更新已安装的技能。

## 图像处理方式

| 方式 | 用途 |
| --- | --- |
| `--segmentation mesh --background transparent` | 使用一张完整透明纹理，适合待机、眨眼、小幅形变 |
| `--segmentation polygon` | 纯 Node 多边形路径 |
| `--segmentation mobilesam` | 可选的按框像素分割 |
| `--segmentation sam3` | 可选的文本部件分割 |
| `--segmentation auto` | 优先已安装的 MobileSAM，再 SAM 3，否则多边形 |

`inspect --image /path/to/image.png` 可查看真实 alpha 与底色污染线索。
`--matte-color '#00ff00'` 可指定已知原始底色。新素材优先使用真实 RGBA；
大幅度独立动作或遮挡变化需要补全隐藏区域的分层素材。

SAM 环境和权重按需放在 `~/.spine-tool/`，由多个项目复用：

```bash
pnpm sam:setup
pnpm sam:check
pnpm sam3:setup
pnpm sam3:check
```

基础的整图/多边形路径不需要 Python。SAM 安装器支持 uv 管理的兼容 Python。
普通产物为 `.json`、`.atlas`、`.png`；可编辑 `.spine` 还需要已授权的 Spine 编辑器和 `--editable`。

## 目录

```text
agent/                  TypeScript 运行入口、环境集成、打包与预览服务
skills/spine-animation/  可独立安装的技能说明、启动器、运行程序和预览资源
server/api/             图像处理、共享网格、眨眼、Spine 生成与导出核心
server/sam/             可选的 Python 模型桥接与安装器
web/agent/              作品预览页面
web/renderer.js         Canvas 动画渲染器
assets/demo/            可复现的示例图片和方案
plans/                  已有动作规划、分层示例与检查图片
temp/test/              独立项目的自动化测试
output/                 生成结果与迁入的演示作品
```

代码保留原有 Apache-2.0 许可证与 NOTICE。
