var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/api/targets.js
var targets_exports = {};
__export(targets_exports, {
  DEFAULT_TARGET: () => DEFAULT_TARGET,
  EXPORT_TARGETS: () => EXPORT_TARGETS,
  buildExportSkeleton: () => buildExportSkeleton,
  resolveTarget: () => resolveTarget,
  restWorldBones: () => restWorldBones
});
function resolveTarget(key) {
  const id = key && EXPORT_TARGETS[key] ? key : DEFAULT_TARGET;
  return { id, ...EXPORT_TARGETS[id] };
}
function restWorldBones(bones) {
  const byName = new Map(bones.map((b, i) => [b.name, { bone: b, index: i }]));
  const world = /* @__PURE__ */ new Map();
  const resolve7 = (name, guard = 0) => {
    if (world.has(name)) return world.get(name);
    const entry = byName.get(name);
    if (!entry || guard > bones.length) return { x: 0, y: 0, index: 0 };
    const { bone, index } = entry;
    const parent = bone.parent ? resolve7(bone.parent, guard + 1) : { x: 0, y: 0 };
    const w = { x: parent.x + (bone.x ?? 0), y: parent.y + (bone.y ?? 0), index };
    world.set(name, w);
    return w;
  };
  for (const b of bones) resolve7(b.name);
  return world;
}
function toSpineMesh(att, world, slotBone) {
  const offX = att.x ?? 0;
  const offY = att.y ?? 0;
  const count = att.uvs.length / 2;
  const vertices = [];
  for (let v = 0; v < count; v++) {
    const wx = slotBone.x + att.vertices[v * 2] + offX;
    const wy = slotBone.y + att.vertices[v * 2 + 1] + offY;
    const names = att.bones?.[v] ?? [];
    const ws = att.weights?.[v] ?? [];
    const live = [];
    for (let i = 0; i < names.length; i++) {
      const w = ws[i];
      if (!w) continue;
      const bw = world.get(names[i]);
      if (!bw) continue;
      const bind = att.bindPositions?.[v]?.[i];
      live.push({ index: bw.index, x: (bind?.[0] ?? wx) - bw.x, y: (bind?.[1] ?? wy) - bw.y, weight: w });
    }
    if (!live.length) {
      const first = world.values().next().value ?? { x: 0, y: 0, index: 0 };
      live.push({ index: first.index, x: wx - first.x, y: wy - first.y, weight: 1 });
    }
    vertices.push(live.length);
    for (const inf of live) {
      vertices.push(
        inf.index,
        +inf.x.toFixed(att.bindPositions ? 6 : 2),
        +inf.y.toFixed(att.bindPositions ? 6 : 2),
        +inf.weight.toFixed(att.bindPositions ? 8 : 4)
      );
    }
  }
  const out = {
    type: "mesh",
    uvs: att.uvs,
    triangles: att.triangles,
    vertices,
    hull: att.hull ?? 0,
    width: att.width,
    height: att.height
  };
  if (att.path) out.path = stripPng(att.path);
  return out;
}
function stripPng(path) {
  return String(path).replace(/\.png$/i, "");
}
function toSpineRegion(att) {
  const out = { ...att };
  delete out.name;
  if (out.path) out.path = stripPng(out.path);
  return out;
}
function convertAnimations(animations, rotateKey, version) {
  const out = {};
  for (const [animName, anim] of Object.entries(animations ?? {})) {
    const bones = {};
    for (const [boneName, track] of Object.entries(anim.bones ?? {})) {
      const converted2 = {};
      if (track.rotate?.length) {
        converted2.rotate = track.rotate.map((k) => {
          const value = k.value ?? k.angle ?? 0;
          return { time: +(k.time ?? 0).toFixed(4), [rotateKey]: +value.toFixed(3) };
        });
      }
      if (track.translate?.length) {
        converted2.translate = track.translate.map((k) => ({
          time: +(k.time ?? 0).toFixed(4),
          x: +(k.x ?? 0).toFixed(3),
          y: +(k.y ?? 0).toFixed(3)
        }));
      }
      if (track.scale?.length) {
        converted2.scale = track.scale.map((k) => ({
          time: +(k.time ?? 0).toFixed(4),
          // 5 位：root 缩放乘的是整个角色高（~1500px），4 位会让鞋底抖 0.07px
          x: +(k.x ?? 1).toFixed(5),
          y: +(k.y ?? 1).toFixed(5)
        }));
      }
      if (Object.keys(converted2).length) bones[boneName] = converted2;
    }
    const colorKey = rotateKey === "angle" ? "color" : "rgba";
    const slots = {};
    for (const [slotName, track] of Object.entries(anim.slots ?? {})) {
      const keys = track.rgba ?? track.color;
      if (!keys?.length) continue;
      slots[slotName] = {
        [colorKey]: keys.map((k) => ({ time: +(k.time ?? 0).toFixed(4), color: k.color }))
      };
    }
    const converted = Object.keys(slots).length ? { bones, slots } : { bones };
    if (anim.deform) {
      const deform = Object.fromEntries(Object.entries(anim.deform).map(([skinName, skin]) => [
        skinName,
        Object.fromEntries(Object.entries(skin).map(([slotName, meshes]) => [
          slotName,
          Object.fromEntries(Object.entries(meshes).map(([meshName, keys]) => {
            const frames = keys.map((key) => ({
              time: +(key.time ?? 0).toFixed(4),
              ...key.vertices ? { offset: key.offset ?? 0, vertices: key.vertices.map((v) => +v.toFixed(6)) } : {}
            }));
            return [meshName, version === "4.1" || version === "4.2" ? { deform: frames } : frames];
          }))
        ]))
      ]));
      converted[version === "4.1" || version === "4.2" ? "attachments" : "deform"] = deform;
    }
    out[animName] = converted;
  }
  return out;
}
function buildExportSkeleton(skeleton, targetKey) {
  const target = resolveTarget(targetKey);
  const bones = skeleton.bones ?? [];
  const world = restWorldBones(bones);
  const srcSkins = Array.isArray(skeleton.skins) ? skeleton.skins : Object.entries(skeleton.skins ?? {}).map(([name, s]) => ({
    name,
    attachments: s.attachments ?? s
  }));
  let meshCount = 0;
  let weightedCount = 0;
  const slotBone = new Map((skeleton.slots ?? []).map((s) => [s.name, s.bone]));
  const convertSkin = (skin) => {
    const slots = {};
    for (const [slotName, atts] of Object.entries(skin.attachments ?? {})) {
      const converted = {};
      const own = world.get(slotBone.get(slotName)) ?? { x: 0, y: 0 };
      for (const [attName, att] of Object.entries(atts)) {
        if (att.type === "mesh") {
          meshCount++;
          if (att.bones?.length) weightedCount++;
          converted[attName] = toSpineMesh(att, world, own);
        } else {
          converted[attName] = toSpineRegion(att);
        }
      }
      slots[slotName] = converted;
    }
    return slots;
  };
  const skins = target.skinsShape === "object" ? Object.fromEntries(srcSkins.map((s) => [s.name, convertSkin(s)])) : srcSkins.map((s) => ({ name: s.name, attachments: convertSkin(s) }));
  const json = {
    skeleton: {
      hash: skeleton.skeleton?.hash ?? "",
      spine: target.spineHeader,
      images: "./images/",
      audio: ""
    },
    bones: bones.map((b) => {
      const out = { name: b.name };
      if (b.parent) out.parent = b.parent;
      if (b.x) out.x = +b.x.toFixed(skeleton.stats?.connectedSkin ? 6 : 2);
      if (b.y) out.y = +b.y.toFixed(skeleton.stats?.connectedSkin ? 6 : 2);
      if (b.rotation) out.rotation = +b.rotation.toFixed(2);
      return out;
    }),
    slots: (skeleton.slots ?? []).map((s) => ({
      name: s.name,
      bone: s.bone,
      attachment: s.attachment
    })),
    skins,
    animations: convertAnimations(skeleton.animations, target.rotateKey, target.atlasVersion)
  };
  return { json, target, stats: { meshCount, weightedCount } };
}
var EXPORT_TARGETS, DEFAULT_TARGET;
var init_targets = __esm({
  "server/api/targets.js"() {
    EXPORT_TARGETS = {
      "cocos-3.8": {
        label: "Cocos Creator 3.8.x",
        spineHeader: "3.8.75",
        atlasVersion: "3.8",
        skinsShape: "object",
        rotateKey: "angle",
        note: "Cocos Creator 3.8.x \u5185\u7F6E Spine 3.8 \u8FD0\u884C\u65F6\uFF0C\u5BFC\u5165\u9700 .json + .atlas + .png \u4E09\u4EF6\u540C\u540D\u540C\u76EE\u5F55"
      },
      /*
       * Unity 走 4.2 而不是 3.8。
       *
       * Unity 没有内置 Spine 运行时，用的是官方 spine-unity 包，而它跟随
       * Spine 编辑器版本走，现在维护的是 4.x 线。发一份 3.8 的骨架过去，
       * spine-unity 要额外开兼容开关才读得进去；4.2 是它默认就吃下的版本，
       * 也是 Cocos Creator 3.8.6+ 能切过去的那一档，两边都能用。
       */
      "unity": {
        label: "Unity (spine-unity)",
        spineHeader: "4.2.10",
        atlasVersion: "4.2",
        skinsShape: "array",
        rotateKey: "value",
        note: "spine-unity \u5305\u5BFC\u5165\uFF1A\u628A\u4E09\u4EF6\u5957\u4E00\u8D77\u62D6\u8FDB Assets \u4E0B\u7684\u540C\u540D\u6587\u4EF6\u5939\uFF0CUnity \u4F1A\u81EA\u52A8\u751F\u6210 _SkeletonData \u8D44\u4EA7"
      },
      "spine-4.0": {
        label: "Spine \u7F16\u8F91\u5668 4.0",
        spineHeader: "4.0.64",
        atlasVersion: "4.0",
        skinsShape: "array",
        rotateKey: "value",
        note: "\u7528 Spine \u7F16\u8F91\u5668\u6253\u5F00\u53EF\u7EE7\u7EED\u624B\u5DE5\u8C03\u6574"
      },
      "spine-4.1": {
        label: "Spine \u7F16\u8F91\u5668 4.1",
        spineHeader: "4.1.23",
        atlasVersion: "4.1",
        skinsShape: "array",
        rotateKey: "value",
        note: "\u7528 Spine \u7F16\u8F91\u5668\u6253\u5F00\u53EF\u7EE7\u7EED\u624B\u5DE5\u8C03\u6574"
      },
      "spine-4.2": {
        label: "Spine \u7F16\u8F91\u5668 4.2",
        spineHeader: "4.2.10",
        atlasVersion: "4.2",
        skinsShape: "array",
        rotateKey: "value",
        note: "Cocos Creator 3.8.4+ \u4E5F\u53EF\u7528 Spine 4.2 \u8FD0\u884C\u65F6"
      },
      /*
       * 下面三个 Web 引擎读的都是标准 Spine JSON，和上面没有格式差异，
       * 只是各自运行时绑定的版本不同——版本头对不上，运行时会拒绝加载。
       *
       * LayaAir 走 3.8：2.x 只认到 3.8/4.0，3.x 也仍支持 3.8，这一档两代都能用。
       * Phaser / PixiJS 走 4.2：官方 spine-phaser、spine-pixi 跟随编辑器 4.2 线。
       */
      "layaair": {
        label: "LayaAir (Spine 3.8)",
        spineHeader: "3.8.75",
        atlasVersion: "3.8",
        skinsShape: "object",
        rotateKey: "angle",
        note: "LayaAir 2.x / 3.x \u7528 Spine 3.8 \u8FD0\u884C\u65F6\u52A0\u8F7D\uFF1A\u4E09\u4EF6\u5957\u653E bin\uFF083.x \u4E3A assets\uFF09\u4E0B\u540C\u76EE\u5F55\uFF0C\u7528 SpineTempletBinary / Spine2DRenderNode \u52A0\u8F7D .json"
      },
      "phaser": {
        label: "Phaser 3 (spine-phaser 4.2)",
        spineHeader: "4.2.10",
        atlasVersion: "4.2",
        skinsShape: "array",
        rotateKey: "value",
        note: "\u9700 Phaser 3.60+ \u548C\u5B98\u65B9 @esotericsoftware/spine-phaser 4.2 \u63D2\u4EF6\uFF1Aload.spineJson + load.spineAtlas \u540E add.spine"
      },
      "pixijs": {
        label: "PixiJS (spine-pixi 4.2)",
        spineHeader: "4.2.10",
        atlasVersion: "4.2",
        skinsShape: "array",
        rotateKey: "value",
        note: "PixiJS v7 \u7528 @esotericsoftware/spine-pixi-v7\uFF0Cv8 \u7528 spine-pixi-v8\uFF08\u5747\u4E3A 4.2\uFF09\uFF1AAssets.load \u4E09\u4EF6\u5957\u540E Spine.from"
      }
    };
    DEFAULT_TARGET = "cocos-3.8";
  }
});

// server/api/atlas.js
var atlas_exports = {};
__export(atlas_exports, {
  MAX_PAGE: () => MAX_PAGE,
  PADDING: () => PADDING,
  applyAtlasToSkeleton: () => applyAtlasToSkeleton,
  packAtlas: () => packAtlas
});
import sharp5 from "sharp";
import { mkdir as mkdir2, writeFile } from "fs/promises";
import { join as join3 } from "path";
async function packAtlas(parts, outDir, opts = {}) {
  const name = opts.name ?? "skeleton";
  const spineVersion = opts.spineVersion ?? "3.8";
  const usable = parts.filter((p) => p.path && p.size?.width > 0 && p.size?.height > 0);
  if (!usable.length) {
    throw new Error("\u6CA1\u6709\u53EF\u6253\u5305\u7684\u90E8\u4EF6\u56FE\u7247");
  }
  const layout = shelfPack(usable);
  await mkdir2(outDir, { recursive: true });
  const pageName = `${name}.png`;
  const pagePath = join3(outDir, pageName);
  const composites = layout.placements.map((p) => ({
    input: p.path,
    left: p.x,
    top: p.y
  }));
  await sharp5({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(composites).png().toFile(pagePath);
  const atlasText = isLegacy(spineVersion) ? writeLegacyAtlas(pageName, layout) : writeModernAtlas(pageName, layout);
  const atlasPath = join3(outDir, `${name}.atlas`);
  await writeFile(atlasPath, atlasText, "utf-8");
  return {
    atlasPath,
    pagePath,
    page: { width: layout.width, height: layout.height },
    regions: layout.placements.map((p) => ({ name: p.name, x: p.x, y: p.y, w: p.w, h: p.h })),
    atlasText
  };
}
function isLegacy(version) {
  return String(version).startsWith("3.");
}
function shelfPack(parts) {
  const items = parts.map((p) => ({
    name: p.name,
    path: p.path,
    w: Math.round(p.size.width),
    h: Math.round(p.size.height)
  })).sort((a, b) => b.h - a.h || b.w - a.w);
  const area = items.reduce((s, it) => s + (it.w + PADDING) * (it.h + PADDING), 0);
  const widest = Math.max(...items.map((it) => it.w + PADDING));
  const pageWidth = Math.min(MAX_PAGE, Math.max(widest, ceilPow2(Math.sqrt(area) * 1.1)));
  const placements = [];
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  let used = 0;
  for (const it of items) {
    if (x + it.w + PADDING > pageWidth && placements.length) {
      y += rowHeight + PADDING;
      x = PADDING;
      rowHeight = 0;
    }
    placements.push({ ...it, x, y });
    x += it.w + PADDING;
    rowHeight = Math.max(rowHeight, it.h);
    used = Math.max(used, y + it.h + PADDING);
  }
  const height = Math.min(MAX_PAGE, Math.ceil(used / 4) * 4);
  if (used > MAX_PAGE) {
    throw new Error(`\u90E8\u4EF6\u603B\u9762\u79EF\u8D85\u51FA\u5355\u9875\u56FE\u96C6\u4E0A\u9650\uFF08\u9700\u8981 ${used}px\uFF0C\u4E0A\u9650 ${MAX_PAGE}px\uFF09\uFF0C\u8BF7\u51CF\u5C11\u90E8\u4EF6\u6216\u964D\u4F4E\u5206\u8FA8\u7387`);
  }
  return { width: pageWidth, height, placements };
}
function ceilPow2(n) {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}
function writeLegacyAtlas(pageName, layout) {
  const out = [""];
  out.push(pageName);
  out.push(`size: ${layout.width},${layout.height}`);
  out.push("format: RGBA8888");
  out.push("filter: Linear,Linear");
  out.push("repeat: none");
  for (const r of layout.placements) {
    out.push(r.name);
    out.push("  rotate: false");
    out.push(`  xy: ${r.x}, ${r.y}`);
    out.push(`  size: ${r.w}, ${r.h}`);
    out.push(`  orig: ${r.w}, ${r.h}`);
    out.push("  offset: 0, 0");
    out.push("  index: -1");
  }
  return out.join("\n") + "\n";
}
function writeModernAtlas(pageName, layout) {
  const out = [pageName];
  out.push(`size: ${layout.width}, ${layout.height}`);
  out.push("filter: Linear, Linear");
  for (const r of layout.placements) {
    out.push(r.name);
    out.push(`  bounds: ${r.x}, ${r.y}, ${r.w}, ${r.h}`);
  }
  return out.join("\n") + "\n";
}
function applyAtlasToSkeleton(skeleton, regions) {
  const byName = new Map(regions.map((r) => [r.name, r]));
  const skins = Array.isArray(skeleton.skins) ? skeleton.skins : [];
  for (const skin of skins) {
    for (const slotAttachments of Object.values(skin.attachments ?? {})) {
      for (const [attName, att] of Object.entries(slotAttachments)) {
        const region = byName.get(att.path?.replace(/\.png$/, "") ?? attName);
        if (!region) continue;
        att.path = region.name;
        if (att.type === "region" || !att.type) {
          att.width = region.w;
          att.height = region.h;
        }
      }
    }
  }
  return skeleton;
}
var PADDING, MAX_PAGE;
var init_atlas = __esm({
  "server/api/atlas.js"() {
    PADDING = 2;
    MAX_PAGE = 4096;
  }
});

// server/api/spine-project.js
var spine_project_exports = {};
__export(spine_project_exports, {
  SPINE_CANDIDATES: () => SPINE_CANDIDATES,
  buildSpineProject: () => buildSpineProject,
  findSpineCli: () => findSpineCli
});
import { existsSync } from "fs";
import { access, constants } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
async function findSpineCli(explicit) {
  const candidates = explicit ? [explicit] : [process.env.SPINE_CLI_PATH, ...SPINE_CANDIDATES].filter(Boolean);
  for (const p of candidates) {
    try {
      await access(p, constants.X_OK);
      return p;
    } catch {
    }
  }
  return null;
}
async function buildSpineProject({ jsonPath, outPath, name, cliPath }) {
  if (!existsSync(jsonPath)) {
    return { ok: false, reason: `\u9AA8\u67B6 JSON \u4E0D\u5B58\u5728: ${jsonPath}` };
  }
  const cli = await findSpineCli(cliPath);
  if (!cli) {
    return {
      ok: false,
      reason: "\u672A\u627E\u5230 Spine \u7F16\u8F91\u5668\uFF0C\u65E0\u6CD5\u751F\u6210\u53EF\u4E8C\u6B21\u7F16\u8F91\u7684 .spine \u5DE5\u7A0B\u3002\u5B89\u88C5 Spine 4.x \u540E\u91CD\u65B0\u5BFC\u51FA\u5373\u53EF\uFF0C\u6216\u8BBE SPINE_CLI_PATH \u6307\u5411\u5B83\u7684\u53EF\u6267\u884C\u6587\u4EF6"
    };
  }
  try {
    await execFileAsync(cli, [
      "-i",
      jsonPath,
      "-o",
      outPath,
      "--to",
      name,
      "--replace",
      "-r"
    ], { timeout: 12e4, maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || "").trim().slice(-300);
    return { ok: false, cliPath: cli, reason: `Spine \u5BFC\u5165\u5931\u8D25: ${detail}` };
  }
  if (!existsSync(outPath)) {
    return { ok: false, cliPath: cli, reason: "Spine \u9000\u51FA\u7801\u4E3A 0\uFF0C\u4F46\u6CA1\u6709\u751F\u6210\u5DE5\u7A0B\u6587\u4EF6" };
  }
  return { ok: true, cliPath: cli };
}
var execFileAsync, SPINE_CANDIDATES;
var init_spine_project = __esm({
  "server/api/spine-project.js"() {
    execFileAsync = promisify(execFile);
    SPINE_CANDIDATES = [
      "/Applications/Spine.app/Contents/MacOS/Spine",
      `${process.env.HOME}/Applications/Spine.app/Contents/MacOS/Spine`,
      "/opt/spine/Spine",
      "/usr/local/bin/Spine",
      "C:\\Program Files\\Spine\\Spine.com"
    ];
  }
});

// server/api/workspace.js
var workspace_exports = {};
__export(workspace_exports, {
  OWNED_DIRS: () => OWNED_DIRS,
  OWNED_EXT: () => OWNED_EXT,
  SPINE_PROJECT_DIR: () => SPINE_PROJECT_DIR,
  basename: () => basename,
  cleanProjectDir: () => cleanProjectDir,
  cleanSourceDir: () => cleanSourceDir,
  imagesDirOf: () => imagesDirOf,
  listArtifacts: () => listArtifacts,
  migrateLegacyLayout: () => migrateLegacyLayout,
  prepareExportDir: () => prepareExportDir,
  prepareProjectDir: () => prepareProjectDir,
  projectDirOf: () => projectDirOf,
  resolveSourceName: () => resolveSourceName,
  safeName: () => safeName,
  sourceDirOf: () => sourceDirOf,
  spineProjectDirOf: () => spineProjectDirOf,
  targetDirOf: () => targetDirOf,
  tempDirOf: () => tempDirOf
});
import { mkdir as mkdir3, readdir, rename, rm, stat } from "fs/promises";
import { join as join4, resolve, basename } from "path";
async function prepareProjectDir(outputDir, projectName, opts = {}) {
  const clean = opts.clean !== false;
  const projectDir = projectDirOf(outputDir, projectName);
  if (!opts.sourceName) {
    let removed2 = 0;
    if (clean) removed2 = await cleanProjectDir(projectDir);
    const imagesDir2 = join4(projectDir, "images");
    await mkdir3(imagesDir2, { recursive: true });
    return { projectDir, sourceDir: projectDir, imagesDir: imagesDir2, removed: removed2, migrated: null };
  }
  const sourceDir = tempDirOf(outputDir, projectName, opts.sourceName);
  let removed = 0;
  if (clean) removed = await cleanSourceDir(sourceDir);
  const migrated = await migrateLegacyLayout(projectDir, opts.sourceName);
  const imagesDir = imagesDirOf(outputDir, projectName, opts.sourceName);
  await mkdir3(imagesDir, { recursive: true });
  return { projectDir, sourceDir, imagesDir, removed, migrated };
}
async function prepareExportDir(sourceDir) {
  let cleared = false;
  try {
    await stat(sourceDir);
    await rm(sourceDir, { recursive: true, force: true });
    cleared = true;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await mkdir3(sourceDir, { recursive: true });
  return { sourceDir, cleared };
}
function projectDirOf(outputDir, projectName) {
  return join4(resolve(outputDir || "./output"), safeName(projectName));
}
function sourceDirOf(outputDir, projectName, sourceName) {
  return join4(projectDirOf(outputDir, projectName), safeName(sourceName));
}
function targetDirOf(outputDir, projectName, sourceName, targetId) {
  return join4(sourceDirOf(outputDir, projectName, sourceName), safeName(targetId));
}
function spineProjectDirOf(outputDir, projectName, sourceName) {
  return join4(sourceDirOf(outputDir, projectName, sourceName), SPINE_PROJECT_DIR);
}
function tempDirOf(outputDir, projectName, sourceName) {
  return join4(projectDirOf(outputDir, projectName), safeName(sourceName) + TEMP_SUFFIX);
}
function imagesDirOf(outputDir, projectName, sourceName) {
  return join4(tempDirOf(outputDir, projectName, sourceName), "Image");
}
function resolveSourceName(originalName, fallback = "source") {
  const raw = basename(String(originalName || "")).replace(/\.[^.]+$/, "").trim();
  return raw ? safeName(raw) : safeName(fallback);
}
async function cleanSourceDir(sourceDir) {
  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }
  let removed = 0;
  for (const entry of entries) {
    const full = join4(sourceDir, entry.name);
    if (entry.isDirectory()) {
      if (!OWNED_DIRS.includes(entry.name)) continue;
      await rm(full, { recursive: true, force: true });
      removed++;
      continue;
    }
    if (entry.name.startsWith(".")) continue;
    const lower = entry.name.toLowerCase();
    if (!OWNED_EXT.some((ext) => lower.endsWith(ext))) continue;
    await rm(full, { force: true });
    removed++;
  }
  return removed;
}
async function cleanProjectDir(projectDir) {
  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }
  let removed = 0;
  for (const entry of entries) {
    const full = join4(projectDir, entry.name);
    if (entry.isDirectory()) {
      if (!OWNED_DIRS.includes(entry.name)) continue;
      await rm(full, { recursive: true, force: true });
      removed++;
      continue;
    }
    if (entry.name.startsWith(".")) continue;
    const lower = entry.name.toLowerCase();
    if (!OWNED_EXT.some((ext) => lower.endsWith(ext))) continue;
    await rm(full, { force: true });
    removed++;
  }
  return removed;
}
async function migrateLegacyLayout(projectDir, sourceName) {
  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const mine = entries.filter((e) => {
    if (e.name.startsWith(".")) return false;
    if (e.isDirectory()) return OWNED_DIRS.includes(e.name);
    const lower = e.name.toLowerCase();
    return OWNED_EXT.some((ext) => lower.endsWith(ext));
  });
  if (mine.length === 0) return null;
  const target = join4(projectDir, safeName(sourceName || basename(projectDir)) + TEMP_SUFFIX);
  try {
    await mkdir3(target, { recursive: true });
    for (const entry of mine) {
      const dst = join4(target, entry.name);
      if (await exists(dst)) continue;
      await rename(join4(projectDir, entry.name), dst);
    }
    return basename(target);
  } catch {
    return null;
  }
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
function safeName(name) {
  const cleaned = String(name || "").replace(/[/\\]/g, "_").replace(/\.{2,}/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").trim();
  return cleaned || "generated";
}
async function listArtifacts(dir) {
  const out = [];
  async function walk(base, prefix = "") {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join4(base, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
        continue;
      }
      try {
        const info = await stat(full);
        out.push({ path: rel, size: info.size });
      } catch {
      }
    }
  }
  await walk(dir);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
var OWNED_EXT, OWNED_DIRS, TEMP_SUFFIX, SPINE_PROJECT_DIR;
var init_workspace = __esm({
  "server/api/workspace.js"() {
    OWNED_EXT = [".png", ".json", ".atlas", ".txt", ".skel"];
    OWNED_DIRS = ["images", "Image"];
    TEMP_SUFFIX = "_temp";
    SPINE_PROJECT_DIR = "Spine\u5DE5\u7A0B";
  }
});

// agent/cli.ts
import { parseArgs as parseArgs2 } from "node:util";
import { resolve as resolve6, basename as basename3, join as join9 } from "node:path";
import { existsSync as existsSync3 } from "node:fs";

// agent/engine.ts
import sharp7 from "sharp";
import { access as access2, mkdir as mkdir4, readFile, writeFile as writeFile2 } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, join as join6, relative, resolve as resolve3, sep } from "node:path";

// server/api/cutter.js
import sharp2 from "sharp";

// server/api/ownership-cleanup.js
var N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
function majorityOther(ownerOf, width, height, x, y, self) {
  const votes = /* @__PURE__ */ new Map();
  for (const [dx, dy] of N8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const o = ownerOf[ny * width + nx];
    if (o === null || o === self) continue;
    votes.set(o, (votes.get(o) ?? 0) + 1);
  }
  let best, bestN = 0;
  for (const [o, n] of votes) if (n > bestN || n === bestN && o < best) {
    best = o;
    bestN = n;
  }
  return best;
}
function removeHairs(ownerOf, width, height, moved) {
  const changes = [];
  const at = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? null : ownerOf[y * width + x];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const me = ownerOf[y * width + x];
      if (me === null) continue;
      const thinH = at(x - 1, y) !== me && at(x + 1, y) !== me;
      const thinV = at(x, y - 1) !== me && at(x, y + 1) !== me;
      if (!thinH && !thinV) continue;
      const to = majorityOther(ownerOf, width, height, x, y, me);
      if (to !== void 0) changes.push([y * width + x, me, to]);
    }
  }
  const total = /* @__PURE__ */ new Map(), thin = /* @__PURE__ */ new Map();
  for (const o of ownerOf) if (o !== null) total.set(o, (total.get(o) ?? 0) + 1);
  for (const [, me] of changes) thin.set(me, (thin.get(me) ?? 0) + 1);
  const kept = changes.filter(([, me]) => thin.get(me) <= total.get(me) * 0.5);
  for (const [i, , to] of kept) ownerOf[i] = to;
  for (const [, , to] of kept) moved.set(to, (moved.get(to) ?? 0) + 1);
  return kept.length;
}
var bin = (rgba, i) => rgba[i * 4] >> 5 << 6 | rgba[i * 4 + 1] >> 5 << 3 | rgba[i * 4 + 2] >> 5;
function histogram(rgba, pixels) {
  const h = new Float64Array(512);
  for (const i of pixels) h[bin(rgba, i)]++;
  const n = Math.max(1, pixels.length);
  for (let k = 0; k < 512; k++) h[k] /= n;
  return h;
}
function affinity(rgba, pixels, hist) {
  let s = 0;
  for (const i of pixels) s += hist[bin(rgba, i)];
  return s / Math.max(1, pixels.length);
}
var COLOR_CHECK_MIN_PX = 50;
function removeIslands(ownerOf, width, height, minIslandFrac, moved, islands, rgba) {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  const comps = [];
  for (let s = 0; s < n; s++) {
    if (ownerOf[s] === null || label[s] >= 0) continue;
    const owner = ownerOf[s];
    const id = comps.length;
    const pixels = [];
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const i = stack.pop();
      pixels.push(i);
      const x = i % width, y = i / width | 0;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const k = ny * width + nx;
        if (label[k] < 0 && ownerOf[k] === owner) {
          label[k] = id;
          stack.push(k);
        }
      }
    }
    comps.push({ owner, pixels });
  }
  const largest = /* @__PURE__ */ new Map();
  const mainComp = /* @__PURE__ */ new Map();
  for (const c of comps) {
    if (c.pixels.length > (largest.get(c.owner) ?? 0)) {
      largest.set(c.owner, c.pixels.length);
      mainComp.set(c.owner, c);
    }
  }
  const hists = /* @__PURE__ */ new Map();
  let total = 0;
  for (const c of comps) {
    if (c.pixels.length >= largest.get(c.owner) * minIslandFrac) continue;
    const votes = /* @__PURE__ */ new Map();
    for (const i of c.pixels) {
      const x = i % width, y = i / width | 0;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const o = ownerOf[ny * width + nx];
        if (o === null || o === c.owner) continue;
        votes.set(o, (votes.get(o) ?? 0) + 1);
      }
    }
    let to, best = 0;
    for (const [o, v] of votes) if (v > best || v === best && o < to) {
      to = o;
      best = v;
    }
    if (to === void 0) continue;
    if (rgba && c.pixels.length >= COLOR_CHECK_MIN_PX) {
      for (const o of [c.owner, to]) if (!hists.has(o)) hists.set(o, histogram(rgba, mainComp.get(o)?.pixels ?? []));
      if (affinity(rgba, c.pixels, hists.get(c.owner)) >= affinity(rgba, c.pixels, hists.get(to))) continue;
    }
    for (const i of c.pixels) ownerOf[i] = to;
    islands.push({ from: c.owner, to, px: c.pixels.length, ofLargest: +(c.pixels.length / largest.get(c.owner)).toFixed(3) });
    moved.set(to, (moved.get(to) ?? 0) + c.pixels.length);
    total += c.pixels.length;
  }
  return total;
}
var BAND_PX = 4;
var HALO_BAND_PX = 24;
var HALO_MIN_CORE = 0.25;
var SPUR_R = 2;
var SPUR_MIN_PX = 6;
var FOREIGN_RATIO = 2;
var OWN_COLOR_MAX = 0.1;
function openMask(mask, w, h, r) {
  const pass = (src, horizontal, isMax) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 1;
      for (let k = -r; k <= r; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
        v = isMax ? s > v ? s : v : s < v ? s : v;
      }
      out[y * w + x] = v;
    }
    return out;
  };
  const eroded = pass(pass(mask, true, false), false, false);
  return pass(pass(eroded, true, true), false, true);
}
function removeForeignEdges(ownerOf, width, height, moved, rgba, edges, depthOf) {
  const boxes = /* @__PURE__ */ new Map();
  for (let i = 0; i < ownerOf.length; i++) {
    const o = ownerOf[i];
    if (o === null) continue;
    const x = i % width, y = i / width | 0;
    const b = boxes.get(o);
    if (!b) boxes.set(o, { x0: x, y0: y, x1: x, y1: y });
    else {
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
  }
  const sizes = /* @__PURE__ */ new Map();
  for (const o of ownerOf) if (o !== null) sizes.set(o, (sizes.get(o) ?? 0) + 1);
  const isHalo = (own, other) => !!depthOf && (depthOf.get(other) ?? 0) > (depthOf.get(own) ?? 0) && coreOf(own).length >= (sizes.get(own) ?? 0) * HALO_MIN_CORE;
  const cores = /* @__PURE__ */ new Map();
  const coreOf = (o) => {
    if (cores.has(o)) return cores.get(o);
    const d0 = depthOf.get(o) ?? 0;
    const near = new Uint8Array(ownerOf.length);
    let frontier = [];
    for (let i = 0; i < ownerOf.length; i++) {
      const n = ownerOf[i];
      if (n === null || n === o || (depthOf.get(n) ?? 0) <= d0) continue;
      frontier.push(i);
    }
    for (let d = 0; d < HALO_BAND_PX && frontier.length; d++) {
      const next = [];
      for (const i of frontier) {
        const x = i % width, y = i / width | 0;
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const k = ny * width + nx;
          if (ownerOf[k] === o && !near[k]) {
            near[k] = 1;
            next.push(k);
          }
        }
      }
      frontier = next;
    }
    const px = [];
    for (let i = 0; i < ownerOf.length; i++) if (ownerOf[i] === o && !near[i]) px.push(i);
    cores.set(o, px);
    return px;
  };
  const hists = /* @__PURE__ */ new Map();
  const histOf = (o, core = false) => {
    const key = core ? `${o}\0core` : o;
    if (!hists.has(key)) {
      let px = core ? coreOf(o) : null;
      if (!px) {
        px = [];
        for (let i = 0; i < ownerOf.length; i++) if (ownerOf[i] === o) px.push(i);
      }
      hists.set(key, histogram(rgba, px));
    }
    return hists.get(key);
  };
  const ratioOk = (k, own, other) => {
    const pb = histOf(other)[k], pa = histOf(own, isHalo(own, other))[k];
    return pb > 2e-3 && pb > pa * FOREIGN_RATIO;
  };
  const shares = /* @__PURE__ */ new Map();
  const foreignShare = (own, other) => {
    const key = `${own}\u2192${other}`;
    if (!shares.has(key)) {
      const halo = isHalo(own, other);
      let n = 0, hit = 0;
      const count = (i) => {
        n++;
        if (Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) < 80) return;
        if (ratioOk(bin(rgba, i), own, other)) hit++;
      };
      if (halo) for (const i of coreOf(own)) count(i);
      else for (let i = 0; i < ownerOf.length; i++) if (ownerOf[i] === own) count(i);
      shares.set(key, n ? hit / n : 0);
    }
    return shares.get(key);
  };
  const bandOf = (own, other) => isHalo(own, other) ? HALO_BAND_PX : BAND_PX;
  const looksLike = (i, own, other) => ratioOk(bin(rgba, i), own, other) && foreignShare(own, other) < OWN_COLOR_MAX;
  const changes = [];
  for (const [o, b] of boxes) {
    const pad = SPUR_R + 1;
    const bx = Math.max(0, b.x0 - pad), by = Math.max(0, b.y0 - pad);
    const bw = Math.min(width - 1, b.x1 + pad) - bx + 1, bh = Math.min(height - 1, b.y1 + pad) - by + 1;
    const mask = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) mask[y * bw + x] = ownerOf[(y + by) * width + x + bx] === o ? 1 : 0;
    const opened = openMask(mask, bw, bh, SPUR_R);
    const toLocal = (i) => ((i / width | 0) - by) * bw + i % width - bx;
    const claim = /* @__PURE__ */ new Map();
    const depth = /* @__PURE__ */ new Map();
    let frontier = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = y * width + x;
      if (ownerOf[i] !== o) continue;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ownerOf[ny * width + nx];
        if (n === null || n === o) continue;
        if (looksLike(i, o, n)) {
          claim.set(i, n);
          depth.set(i, 1);
          frontier.push(i);
        }
        break;
      }
    }
    while (frontier.length) {
      const next = [];
      for (const i of frontier) {
        const to = claim.get(i), d = depth.get(i);
        const x = i % width, y = i / width | 0;
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const k = ny * width + nx;
          if (ownerOf[k] !== o || claim.has(k)) continue;
          const spur = !opened[toLocal(k)];
          if (d + 1 > bandOf(o, to) && !spur) continue;
          if (!looksLike(k, o, to)) continue;
          claim.set(k, to);
          depth.set(k, d + 1);
          next.push(k);
        }
      }
      frontier = next;
    }
    const seen = /* @__PURE__ */ new Set();
    for (const s0 of claim.keys()) {
      if (seen.has(s0)) continue;
      const comp = [], stack = [s0];
      seen.add(s0);
      while (stack.length) {
        const i = stack.pop();
        comp.push(i);
        const x = i % width, y = i / width | 0;
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const k = ny * width + nx;
          if (claim.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push(k);
          }
        }
      }
      if (comp.length >= SPUR_MIN_PX) for (const i of comp) changes.push([i, claim.get(i), o]);
    }
  }
  const pairs = /* @__PURE__ */ new Map();
  for (const [i, to, from] of changes) {
    ownerOf[i] = to;
    moved.set(to, (moved.get(to) ?? 0) + 1);
    const key = `${from}\u2192${to}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  for (const [key, px] of pairs) {
    const [from, to] = key.split("\u2192");
    edges.push({ from, to, px });
  }
  return changes.length;
}
function cleanupOwnership(ownerOf, width, height, { minIslandFrac = 0.15, rgba = null, foreignEdges = true, depthOf = null } = {}) {
  const moved = /* @__PURE__ */ new Map();
  const hairPx = removeHairs(ownerOf, width, height, moved);
  const islands = [];
  const islandPx = removeIslands(ownerOf, width, height, minIslandFrac, moved, islands, rgba);
  const edges = [];
  const edgePx = rgba && foreignEdges ? removeForeignEdges(ownerOf, width, height, moved, rgba, edges, depthOf) : 0;
  let hair2 = 0, island2 = 0;
  if (edgePx) {
    island2 = removeIslands(ownerOf, width, height, minIslandFrac, moved, islands, rgba);
    hair2 = removeHairs(ownerOf, width, height, moved);
  }
  return { islandPx: islandPx + island2, hairPx: hairPx + hair2, edgePx, edges, moved, islands };
}

// server/api/pen-edge.js
import sharp from "sharp";
var BAND_R = 5;
var SNAP_REACH = 4.5;
var INK_MAX_LUM = 110;
var INK_CONTRAST = 45;
var INK_MAX_RUN = 4;
var RDP_EPS = 0.6;
var MAX_SEG = 3;
var lumAt = (src, i) => src[i * 4 + 3] < 8 ? 255 : 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2];
var PAD = 4;
function traceLoops(M, w0, h0) {
  const w = w0 + 2 * PAD, h = h0 + 2 * PAD;
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 1 : M[Math.min(h0 - 1, Math.max(0, y - PAD)) * w0 + Math.min(w0 - 1, Math.max(0, x - PAD))];
  const segs = /* @__PURE__ */ new Map();
  const key = (x, y) => y * (2 * w + 4) + x + 2 * (2 * w + 4) + 2;
  const add = (a, b) => {
    const k = key(a[0], a[1]);
    let e = segs.get(k);
    if (!e) segs.set(k, e = []);
    e.push(b);
  };
  const TABLE = { 1: [["L", "B"]], 2: [["B", "R"]], 3: [["L", "R"]], 4: [["R", "T"]], 5: [["L", "T"], ["R", "B"]], 6: [["B", "T"]], 7: [["L", "T"]], 8: [["T", "L"]], 9: [["T", "B"]], 10: [["T", "R"], ["B", "L"]], 11: [["T", "R"]], 12: [["R", "L"]], 13: [["R", "B"]], 14: [["B", "L"]] };
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const c = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1);
    const list = TABLE[c];
    if (!list) continue;
    const P = { T: [2 * x + 1, 2 * y], R: [2 * x + 2, 2 * y + 1], B: [2 * x + 1, 2 * y + 2], L: [2 * x, 2 * y + 1] };
    for (const [a, b] of list) add(P[a], P[b]);
  }
  const loops = [];
  for (const [k0, ends0] of segs) {
    while (ends0.length) {
      const loop = [];
      let cur = ends0.pop();
      let guard = 0;
      while (guard++ < 4 * w * h + 16) {
        loop.push([cur[0] / 2 - PAD, cur[1] / 2 - PAD]);
        const k = key(cur[0], cur[1]);
        if (k === k0 && loop.length > 1) break;
        const e = segs.get(k);
        if (!e || !e.length) break;
        cur = e.pop();
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}
function markZone(zone, w, h, cx, cy, r) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) zone[y * w + x] = 1;
  }
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
function anchorsOf(loop) {
  if (loop.length < 8) return loop;
  const half = loop.length >> 1;
  const s = [...rdp(loop.slice(0, half + 1), RDP_EPS).slice(0, -1), ...rdp([...loop.slice(half), loop[0]], RDP_EPS).slice(0, -1)];
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[i], b = s[(i + 1) % s.length];
    const k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / MAX_SEG);
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
}
function bezierPath(s) {
  const n = s.length;
  if (n < 3) return "";
  const f = (v) => v.toFixed(2);
  let d = `M${f(s[0][0])},${f(s[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = s[(i - 1 + n) % n], p1 = s[i], p2 = s[(i + 1) % n], p3 = s[(i + 2) % n];
    const t = 1 / 6;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) * t)},${f(p1[1] + (p2[1] - p0[1]) * t)} ${f(p2[0] - (p3[0] - p1[0]) * t)},${f(p2[1] - (p3[1] - p1[1]) * t)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + "Z";
}
function snapOffset(p, n, src, w, h, mine, behind) {
  const pix = (t) => {
    const x = Math.round(p[0] + n[0] * t), y = Math.round(p[1] + n[1] * t);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  const ts = [];
  for (let t = -SNAP_REACH; t <= SNAP_REACH + 1e-6; t += 1) ts.push(t);
  const idx = ts.map(pix);
  if (idx.some((i) => i < 0)) return 0;
  const lum = idx.map((i) => lumAt(src, i));
  const ref = Math.max(lum[0], lum[1], lum[lum.length - 1], lum[lum.length - 2]);
  const ink = lum.map((l) => l < INK_MAX_LUM && l < ref - INK_CONTRAST);
  const runs = [];
  for (let k = 0; k < ink.length; k++) {
    if (!ink[k]) continue;
    let e2 = k;
    while (e2 + 1 < ink.length && ink[e2 + 1]) e2++;
    if (k > 0 && e2 < ink.length - 1 && e2 - k + 1 <= INK_MAX_RUN) runs.push([k, e2]);
    k = e2;
  }
  if (!runs.length) return 0;
  const mid = ts.length / 2;
  const best = runs.reduce((a, r) => Math.min(Math.abs(ts[r[0]]), Math.abs(ts[r[1]])) < Math.min(Math.abs(ts[a[0]]), Math.abs(ts[a[1]])) ? r : a);
  const [s, e] = best;
  if (s >= mid) {
    if (s !== mid || !behind[idx[s]]) return 0;
    return ts[e] + 0.5;
  }
  if (e < mid - 1) {
    const out = idx[ts.length - 1], inn = idx[0];
    for (let k = e + 1; k < mid; k++) {
      const i = idx[k];
      if (!mine[i]) return 0;
      let dOut = 0, dIn = 0;
      for (let c = 0; c < 3; c++) {
        dOut += (src[i * 4 + c] - src[out * 4 + c]) ** 2;
        dIn += (src[i * 4 + c] - src[inn * 4 + c]) ** 2;
      }
      if (dOut >= dIn) return 0;
    }
    return ts[e] + 0.5;
  }
  return ts[e] + 0.5;
}
function buildPaths(mine, behind, src, w, h, snap) {
  const N = w * h;
  const band = new Uint8Array(N);
  let edges = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mine[i]) continue;
    if (!(x > 0 && behind[i - 1] || x < w - 1 && behind[i + 1] || y > 0 && behind[i - w] || y < h - 1 && behind[i + w])) continue;
    edges++;
    for (let dy = -BAND_R; dy <= BAND_R; dy++) for (let dx = -BAND_R; dx <= BAND_R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) band[ny * w + nx] = 1;
    }
  }
  const snapZone = new Uint8Array(N);
  if (!edges) return { edges, band, snapZone, paths: [], anchors: 0, snapped: 0 };
  const M = new Uint8Array(N);
  for (let i = 0; i < N; i++) M[i] = behind[i] ? 0 : 1;
  const loops = traceLoops(M, w, h);
  let anchors = 0, snapped = 0;
  const paths = [];
  for (const loop of loops) {
    const n = loop.length;
    if (snap && n >= 8) {
      const offs = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const a = loop[(k - 2 + n) % n], b = loop[(k + 2) % n];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const len = Math.hypot(tx, ty);
        if (!len) continue;
        tx /= len;
        ty /= len;
        let nrm = [-ty, tx];
        const p = loop[k];
        const side = (sg) => {
          const x = Math.round(p[0] + nrm[0] * 0.7 * sg), y = Math.round(p[1] + nrm[1] * 0.7 * sg);
          return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
        };
        let o = side(1), iIn = side(-1);
        if (o >= 0 && !behind[o]) {
          nrm = [-nrm[0], -nrm[1]];
          [o, iIn] = [iIn, o];
        }
        if (o < 0 || iIn < 0 || !behind[o] || !mine[iIn]) continue;
        offs[k] = snapOffset(p, nrm, src, w, h, mine, behind);
        loop[k] = [p[0], p[1], nrm[0], nrm[1]];
      }
      const med = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const win = [];
        for (let d = -2; d <= 2; d++) win.push(offs[(k + d + n) % n]);
        win.sort((x, y) => x - y);
        med[k] = win[2];
      }
      for (let k = 0; k < n; k++) {
        const v = (med[(k - 1 + n) % n] + med[k] + med[(k + 1) % n]) / 3;
        if (Math.abs(v) >= 0.25 && loop[k].length === 4) {
          snapped++;
          markZone(snapZone, w, h, loop[k][0], loop[k][1], Math.abs(v) + 2);
          loop[k] = [loop[k][0] + loop[k][2] * v, loop[k][1] + loop[k][3] * v];
        } else loop[k] = [loop[k][0], loop[k][1]];
      }
    }
    const pts = anchorsOf(loop.map((p) => [p[0], p[1]]));
    anchors += pts.length;
    if (pts.length >= 3) paths.push(pts.length >= 4 ? bezierPath(pts) : `M${pts.map((p) => p.join(",")).join(" L")}Z`);
  }
  return { edges, band, snapZone, paths, anchors, snapped };
}
async function mineCoverage(paths, w, h) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="translate(0.5,0.5)"><path d="${paths.join(" ")}" fill="#fff" fill-rule="evenodd"/></g></svg>`;
  const cov = await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer();
  for (let i = 0; i < cov.length; i++) cov[i] = 255 - cov[i];
  return cov;
}
async function penEdge(buf, width, height, mine, behind, src, opts = {}) {
  const w = width, h = height, N = w * h;
  const { edges, band, snapZone, paths, anchors, snapped } = buildPaths(mine, behind, src, w, h, opts.snap !== false);
  if (!edges) return { buf: Buffer.from(buf), anchors: 0, snapped: 0 };
  const cov = await mineCoverage(paths, w, h);
  const out = Buffer.from(buf);
  for (let i = 0; i < N; i++) {
    if (!band[i] || !(mine[i] || behind[i])) continue;
    const c = cov[i] / 255;
    if (mine[i]) {
      if (snapZone[i]) out[i * 4 + 3] = Math.round(buf[i * 4 + 3] * c);
    } else {
      const a = Math.round(src[i * 4 + 3] * c);
      if (!snapZone[i] && buf[i * 4 + 3] >= a) continue;
      if (a > 0) {
        out[i * 4] = src[i * 4];
        out[i * 4 + 1] = src[i * 4 + 1];
        out[i * 4 + 2] = src[i * 4 + 2];
      }
      out[i * 4 + 3] = a;
    }
  }
  return { buf: dropSplitPieces(buf, out, w, h), anchors, snapped };
}
var OWN_PAD = 8;
async function snapOwnership(ownerOf, rgba, W, H, depthOf) {
  const boxes = /* @__PURE__ */ new Map();
  for (let i = 0; i < W * H; i++) {
    const o = ownerOf[i];
    if (o === null || o === void 0) continue;
    const x = i % W, y = i / W | 0;
    const b = boxes.get(o);
    if (!b) boxes.set(o, [x, y, x, y]);
    else {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }
  const depth = (n) => depthOf.get(n) ?? 0;
  const names = [...boxes.keys()].sort((a, b) => depth(b) - depth(a));
  let toBehind = 0, toFront = 0;
  for (const name of names) {
    const [bx0, by0, bx1, by1] = boxes.get(name);
    const x0 = Math.max(0, bx0 - OWN_PAD), y0 = Math.max(0, by0 - OWN_PAD);
    const x1 = Math.min(W, bx1 + 1 + OWN_PAD), y1 = Math.min(H, by1 + 1 + OWN_PAD);
    const w = x1 - x0, h = y1 - y0, N = w * h;
    const mine = new Uint8Array(N), behind = new Uint8Array(N);
    const src = Buffer.alloc(N * 4);
    const myDepth = depth(name);
    let anyBehind = false;
    for (let y = 0; y < h; y++) {
      rgba.copy(src, y * w * 4, ((y + y0) * W + x0) * 4, ((y + y0) * W + x1) * 4);
      for (let x = 0; x < w; x++) {
        const si = (y + y0) * W + x + x0, o = ownerOf[si];
        if (o === name) mine[y * w + x] = 1;
        else if (o !== null && o !== void 0 && rgba[si * 4 + 3] >= 8 && depth(o) < myDepth) {
          behind[y * w + x] = 1;
          anyBehind = true;
        }
      }
    }
    if (!anyBehind) continue;
    const { paths, snapZone, snapped } = buildPaths(mine, behind, src, w, h, true);
    if (!snapped) continue;
    const cov = await mineCoverage(paths, w, h);
    const changes = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!snapZone[i]) continue;
      if (mine[i] && cov[i] < 128) {
        const votes = /* @__PURE__ */ new Map();
        for (let r = 1; r <= 3 && !votes.size; r++) {
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || !behind[ny * w + nx]) continue;
            const o = ownerOf[(ny + y0) * W + nx + x0];
            votes.set(o, (votes.get(o) ?? 0) + 1);
          }
        }
        if (!votes.size) continue;
        const to = [...votes].sort((a, b) => b[1] - a[1])[0][0];
        changes.push([(y + y0) * W + x + x0, to]);
        toBehind++;
      } else if (behind[i] && cov[i] >= 128) {
        changes.push([(y + y0) * W + x + x0, name]);
        toFront++;
      }
    }
    for (const [si, to] of changes) ownerOf[si] = to;
  }
  return { toBehind, toFront };
}
var SPLIT_SMALL_PX = 200;
var SPLIT_SMALL_FRAC = 0.05;
function components(buf, w, h) {
  const lab = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const q = [];
  for (let s = 0; s < w * h; s++) {
    if (lab[s] >= 0 || buf[s * 4 + 3] < 32) continue;
    const id = sizes.length;
    lab[s] = id;
    q.push(s);
    let n = 0;
    while (q.length) {
      const i = q.pop();
      n++;
      const x = i % w, y = i / w | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (lab[j] < 0 && buf[j * 4 + 3] >= 32) {
          lab[j] = id;
          q.push(j);
        }
      }
    }
    sizes.push(n);
  }
  return { lab, sizes };
}
function dropSplitPieces(before, after, w, h) {
  const B = components(before, w, h), A = components(after, w, h);
  const parentOf = new Int32Array(A.sizes.length).fill(-1);
  for (let i = 0; i < w * h; i++) {
    const a = A.lab[i];
    if (a >= 0 && parentOf[a] < 0 && B.lab[i] >= 0) parentOf[a] = B.lab[i];
  }
  const kids = /* @__PURE__ */ new Map();
  parentOf.forEach((p, a) => {
    if (p >= 0) (kids.get(p) ?? kids.set(p, []).get(p)).push(a);
  });
  const drop = /* @__PURE__ */ new Set(), restore = /* @__PURE__ */ new Set();
  for (const [p, list] of kids) {
    if (list.length < 2) continue;
    list.sort((x, y) => A.sizes[y] - A.sizes[x]);
    for (const a of list.slice(1)) {
      if (A.sizes[a] <= SPLIT_SMALL_PX && A.sizes[a] < SPLIT_SMALL_FRAC * B.sizes[p]) drop.add(a);
      else restore.add(p);
    }
  }
  if (!drop.size && !restore.size) return after;
  for (let i = 0; i < w * h; i++) {
    if (restore.has(B.lab[i])) {
      before.copy(after, i * 4, i * 4, i * 4 + 4);
      continue;
    }
    const a = A.lab[i];
    if (a >= 0 && drop.has(a) && !restore.has(parentOf[a])) after.fill(0, i * 4, i * 4 + 4);
  }
  return after;
}

// server/api/cutter.js
import { mkdir } from "fs/promises";
import { join } from "path";
var DEFAULT_MARGIN = 4;
var DEFAULT_BLEED = 2;
var ALPHA_CUTOFF = 8;
var GROW_CAP = 120;
var POLY_SLACK = 15;
function dilateSquare(mask, W, H, r) {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let cnt = 0;
    const row = y * W;
    for (let x = 0; x < Math.min(W, r); x++) cnt += mask[row + x] ? 1 : 0;
    for (let x = 0; x < W; x++) {
      if (x + r < W && mask[row + x + r]) cnt++;
      if (x - r - 1 >= 0 && mask[row + x - r - 1]) cnt--;
      if (cnt > 0) tmp[row + x] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let cnt = 0;
    for (let y = 0; y < Math.min(H, r); y++) cnt += tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      if (y + r < H && tmp[(y + r) * W + x]) cnt++;
      if (y - r - 1 >= 0 && tmp[(y - r - 1) * W + x]) cnt--;
      if (cnt > 0) out[y * W + x] = 1;
    }
  }
  return out;
}
var HIDDEN_PAD = 0.15;
async function decodeMask(png, W, H) {
  const { data, info } = await sharp2(png).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(W * H);
  if (info.width === W && info.height === H) {
    for (let i = 0; i < W * H; i++) mask[i] = data[i] > 127 ? 1 : 0;
  } else {
    for (let y = 0; y < H; y++) {
      const sy = Math.min(info.height - 1, Math.floor(y * info.height / H));
      for (let x = 0; x < W; x++) {
        const sx = Math.min(info.width - 1, Math.floor(x * info.width / W));
        mask[y * W + x] = data[sy * info.width + sx] > 127 ? 1 : 0;
      }
    }
  }
  return mask;
}
function fillPolygon(polygon, W, H, offX = 0, offY = 0) {
  const mask = new Uint8Array(W * H);
  const n = polygon.length;
  if (n < 3) return mask;
  const px = polygon.map((p) => p.x - offX);
  const py = polygon.map((p) => p.y - offY);
  for (let y = 0; y < H; y++) {
    const xs = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = py[i], yj = py[j];
      if (yi > y !== yj > y) {
        xs.push(px[i] + (y - yi) / (yj - yi) * (px[j] - px[i]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W, Math.ceil(xs[k + 1]));
      for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
    }
  }
  return mask;
}
var SNAP_MIN_SIDE = 4;
var SNAP_MIN_AREA = 24;
var SNAP_SEED_RADIUS = 2;
var WIDTH_JUMP = 2.2;
var WIDTH_MIN_RUN = 6;
function snapToSilhouette(srcData, srcW, srcH, bbox) {
  const bx0 = Math.max(0, Math.floor(bbox.x));
  const by0 = Math.max(0, Math.floor(bbox.y));
  const bx1 = Math.min(srcW, Math.ceil(bbox.x + bbox.width));
  const by1 = Math.min(srcH, Math.ceil(bbox.y + bbox.height));
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  if (bw < 2 || bh < 2) return null;
  const opaque = (x, y) => srcData[(y * srcW + x) * 4 + 3] >= ALPHA_CUTOFF;
  const label = new Int32Array(bw * bh).fill(-1);
  const parent = [];
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b2) => {
    const ra = find(a), rb = find(b2);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!opaque(bx0 + x, by0 + y)) continue;
      const idx = y * bw + x;
      const id = parent.length;
      parent.push(id);
      label[idx] = id;
      if (x > 0 && label[idx - 1] >= 0) union(label[idx - 1], id);
      if (y > 0 && label[idx - bw] >= 0) union(label[idx - bw], id);
      if (y > 0 && x > 0 && label[idx - bw - 1] >= 0) union(label[idx - bw - 1], id);
      if (y > 0 && x < bw - 1 && label[idx - bw + 1] >= 0) union(label[idx - bw + 1], id);
    }
  }
  const blobs = /* @__PURE__ */ new Map();
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const l = label[y * bw + x];
      if (l < 0) continue;
      const root = find(l);
      let b2 = blobs.get(root);
      if (!b2) {
        b2 = { x0: x, y0: y, x1: x, y1: y, area: 0 };
        blobs.set(root, b2);
      }
      if (x < b2.x0) b2.x0 = x;
      if (y < b2.y0) b2.y0 = y;
      if (x > b2.x1) b2.x1 = x;
      if (y > b2.y1) b2.y1 = y;
      b2.area++;
    }
  }
  if (!blobs.size) return null;
  const cx = Math.round(bw / 2);
  const cy = Math.round(bh / 2);
  let chosen = null;
  let bestDist = Infinity;
  for (let dy = -SNAP_SEED_RADIUS; dy <= SNAP_SEED_RADIUS && !chosen; dy++) {
    for (let dx = -SNAP_SEED_RADIUS; dx <= SNAP_SEED_RADIUS; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
      const l = label[y * bw + x];
      if (l < 0) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < bestDist) {
        bestDist = d;
        chosen = find(l);
      }
    }
  }
  if (chosen === null) {
    let nearest = Infinity;
    for (const [root, b2] of blobs) {
      const bx = (b2.x0 + b2.x1) / 2;
      const by = (b2.y0 + b2.y1) / 2;
      const d = Math.hypot(bx - cx, by - cy);
      if (d < nearest) {
        nearest = d;
        chosen = root;
      }
    }
  }
  const b = blobs.get(chosen);
  if (!b || b.area < SNAP_MIN_AREA) return null;
  let x1 = b.x1;
  const y1 = b.y1;
  let cutRow = null;
  const rowWidth = [];
  for (let y = b.y0; y <= y1; y++) {
    let n = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      const l = label[y * bw + x];
      if (l >= 0 && find(l) === chosen) n++;
    }
    rowWidth.push(n);
  }
  const samples = rowWidth.filter((_, i) => i % 3 === 0).sort((p, q) => p - q);
  const median = samples[Math.floor(samples.length / 2)] || 0;
  if (median >= SNAP_MIN_SIDE) {
    let run = 0;
    for (let i = 0; i < rowWidth.length; i++) {
      if (rowWidth[i] <= median * 1.5) {
        run++;
        continue;
      }
      if (run >= WIDTH_MIN_RUN && rowWidth[i] > median * WIDTH_JUMP) {
        cutRow = b.y0 + i;
        break;
      }
      run = 0;
    }
  }
  const newH = cutRow === null ? y1 - b.y0 + 1 : cutRow - b.y0;
  const w = x1 - b.x0 + 1;
  if (w < SNAP_MIN_SIDE || newH < SNAP_MIN_SIDE) return null;
  return {
    bbox: { x: bx0 + b.x0, y: by0 + b.y0, width: w, height: newH },
    area: b.area,
    blobs: blobs.size,
    truncatedAt: cutRow === null ? null : by0 + cutRow
  };
}
async function cutImageParts(sourcePath, parts, outputDir, opts = {}) {
  const margin = opts.margin ?? DEFAULT_MARGIN;
  const bleed = opts.bleed ?? DEFAULT_BLEED;
  const snap = opts.snap !== false;
  const growCap = opts.growCap ?? GROW_CAP;
  const results = [];
  await mkdir(outputDir, { recursive: true });
  const meta = await sharp2(sourcePath).metadata();
  const srcW = meta.width;
  const srcH = meta.height;
  const src = snap ? (await sharp2(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data : null;
  const byName = new Map(parts.map((p) => [p.name, p]));
  const srcAlpha = src ?? (await sharp2(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
  const samMasks = /* @__PURE__ */ new Map();
  if (opts.samMasks?.size) {
    for (const [name, entry] of opts.samMasks) {
      try {
        samMasks.set(name, await decodeMask(entry.png, srcW, srcH));
      } catch (e) {
        console.warn(`[\u5207\u56FE] \u26A0 ${name} \u7684 SAM \u63A9\u7801\u89E3\u7801\u5931\u8D25\uFF0C\u9000\u56DE\u591A\u8FB9\u5F62: ${e.message}`);
      }
    }
    console.log(`[\u5207\u56FE] \u26F6 ${samMasks.size}/${parts.length} \u4E2A\u90E8\u4EF6\u7528 SAM \u50CF\u7D20\u7EA7\u63A9\u7801`);
  }
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const depthOf = new Map(parts.map((p) => [p.name, Number.isFinite(p.depth) ? p.depth : 0]));
  const ownerOf = new Array(srcW * srcH).fill(null);
  {
    const areaOf = /* @__PURE__ */ new Map();
    for (const [name, mask] of samMasks) {
      let n = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
      areaOf.set(name, n);
    }
    const better = (a, b, area = areaOf) => {
      const da = depthOf.get(a) ?? 0, db = depthOf.get(b) ?? 0;
      if (da !== db) return da > db;
      const aa = area.get(a) ?? Infinity, ab = area.get(b) ?? Infinity;
      if (aa !== ab) return aa < ab;
      return a < b;
    };
    const clipToBox = (name, mask) => {
      const b = byName.get(name)?.bbox;
      if (!b) return mask;
      const bx0 = Math.max(0, Math.round(b.x));
      const by0 = Math.max(0, Math.round(b.y));
      const bx1 = Math.min(srcW, Math.round(b.x + b.width));
      const by1 = Math.min(srcH, Math.round(b.y + b.height));
      const out = new Uint8Array(mask.length);
      for (let y = by0; y < by1; y++) {
        const row = y * srcW;
        for (let x = bx0; x < bx1; x++) {
          if (mask[row + x]) out[row + x] = 1;
        }
      }
      return out;
    };
    const nearPoly = /* @__PURE__ */ new Map();
    for (const p of parts) {
      if (Array.isArray(p.polygon) && p.polygon.length >= 3) {
        nearPoly.set(p.name, dilateSquare(fillPolygon(p.polygon, srcW, srcH, 0, 0), srcW, srcH, POLY_SLACK));
      }
    }
    const mayClaim = (name, i) => !nearPoly.has(name) || !!nearPoly.get(name)[i];
    const clipToPolygon = (name, mask) => {
      const near = nearPoly.get(name);
      if (!near) return mask;
      const out = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) if (mask[i] && near[i]) out[i] = 1;
      return out;
    };
    let contested = 0;
    let clippedOut = 0;
    for (const [name, rawMask] of samMasks) {
      const mask = clipToPolygon(name, clipToBox(name, rawMask));
      let raw = 0;
      for (let i = 0; i < rawMask.length; i++) if (rawMask[i]) raw++;
      let kept = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i]) kept++;
      if (kept < raw) clippedOut += raw - kept;
      samMasks.set(name, mask);
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        if (srcAlpha[i * 4 + 3] < ALPHA_CUTOFF) continue;
        const cur = ownerOf[i];
        if (cur === null) {
          ownerOf[i] = name;
          continue;
        }
        contested++;
        if (better(name, cur)) ownerOf[i] = name;
      }
    }
    if (clippedOut) {
      console.log(`[\u5207\u56FE] \u2702 \u63A9\u7801\u8D85\u51FA\u81EA\u5DF1\u7684\u6846\u6216\u591A\u8FB9\u5F62 ${POLY_SLACK}px \u5916\uFF0C\u5DF2\u88C1\u6389 ${clippedOut}px\uFF08SAM \u4F1A\u5916\u6EA2\u5230\u90BB\u4EF6\u4E0A\uFF09`);
    }
    if (contested) {
      console.log(`[\u5207\u56FE] \u2696 \u63A9\u7801\u91CD\u53E0 ${contested}px\uFF0C\u5DF2\u6309\u300Cdepth \u6700\u5927\u8005\u72EC\u5360\u300D\u5B9A\u5F52\u5C5E\uFF08\u907F\u514D\u540C\u4E00\u5757\u5185\u5BB9\u8FDB\u591A\u5F20\u56FE\uFF09`);
    }
    const samClaimed = new Uint8Array(srcW * srcH);
    for (let i = 0; i < ownerOf.length; i++) if (ownerOf[i] !== null) samClaimed[i] = 1;
    const polyArea = /* @__PURE__ */ new Map();
    const polyMasks = [];
    for (const part of parts) {
      if (!Array.isArray(part.polygon) || part.polygon.length < 3) continue;
      const m = fillPolygon(part.polygon, srcW, srcH, 0, 0);
      let n = 0;
      for (let i = 0; i < m.length; i++) if (m[i]) n++;
      polyArea.set(part.name, n);
      polyMasks.push([part.name, m]);
    }
    let polyClaimed = 0, polyContested = 0;
    for (const [name, m] of polyMasks) {
      for (let i = 0; i < m.length; i++) {
        if (!m[i] || samClaimed[i]) continue;
        if (srcAlpha[i * 4 + 3] < ALPHA_CUTOFF) continue;
        const cur = ownerOf[i];
        if (cur === null) {
          ownerOf[i] = name;
          polyClaimed++;
          continue;
        }
        polyContested++;
        if (better(name, cur, polyArea)) ownerOf[i] = name;
      }
    }
    if (polyClaimed) {
      console.log(`[\u5207\u56FE] \u2B21 \u591A\u8FB9\u5F62\u8BA4\u9886 ${polyClaimed}px\uFF08\u5176\u4E2D ${polyContested}px \u6709\u591A\u4E2A\u8F6E\u5ED3\u91CD\u53E0\uFF0C\u6309 depth \u5224\u7ED9\u6700\u9760\u524D\u7684\uFF09`);
    }
    const boxArea = new Map(parts.map((p) => {
      const b = p.bbox;
      return [p.name, b ? b.width * b.height : Infinity];
    }));
    let rescued = 0;
    const rescuedBy = /* @__PURE__ */ new Map();
    for (const part of parts) {
      const b = part.bbox;
      if (!b) continue;
      const bx0 = Math.max(0, Math.round(b.x));
      const by0 = Math.max(0, Math.round(b.y));
      const bx1 = Math.min(srcW, Math.round(b.x + b.width));
      const by1 = Math.min(srcH, Math.round(b.y + b.height));
      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          const i = y * srcW + x;
          if (ownerOf[i] !== null) continue;
          if (srcAlpha[i * 4 + 3] < ALPHA_CUTOFF) continue;
          if (!mayClaim(part.name, i)) continue;
          let mine = true;
          for (const other of parts) {
            if (other === part || !other.bbox) continue;
            if (!mayClaim(other.name, i)) continue;
            const o = other.bbox;
            if (x < o.x || y < o.y || x >= o.x + o.width || y >= o.y + o.height) continue;
            if ((boxArea.get(other.name) ?? Infinity) < (boxArea.get(part.name) ?? Infinity)) {
              mine = false;
              break;
            }
          }
          if (!mine) continue;
          ownerOf[i] = part.name;
          rescued++;
          rescuedBy.set(part.name, (rescuedBy.get(part.name) ?? 0) + 1);
        }
      }
    }
    if (rescued) {
      const top = [...rescuedBy].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${c}px`).join("\uFF0C");
      console.log(`[\u5207\u56FE] \u2295 \u8865\u9F50 ${rescued}px \u65E0\u63A9\u7801\u8BA4\u9886\u7684\u5185\u5BB9\uFF08\u6309\u6846\u5F52\u5C5E\uFF0C\u4E3B\u8981\u662F ${top}\uFF09`);
    }
    const inAnyBox = (x, y) => parts.some((p) => {
      const b = p.bbox;
      return b && x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height;
    });
    const unclaimed = new Uint8Array(srcW * srcH);
    let unclaimedN = 0;
    for (let i = 0; i < srcW * srcH; i++) {
      if (ownerOf[i] !== null) continue;
      if (srcAlpha[i * 4 + 3] < ALPHA_CUTOFF) continue;
      unclaimed[i] = 1;
      unclaimedN++;
    }
    let adopted = 0;
    const adoptedBy = /* @__PURE__ */ new Map();
    if (unclaimedN) {
      const visited = new Uint8Array(srcW * srcH);
      for (let i0 = 0; i0 < srcW * srcH; i0++) {
        if (!unclaimed[i0] || visited[i0]) continue;
        const votes = /* @__PURE__ */ new Map();
        const mine = [];
        let q = [i0];
        visited[i0] = 1;
        while (q.length) {
          const nq = [];
          for (const j of q) {
            if (ownerOf[j] === null) mine.push(j);
            const x = j % srcW, y = j / srcW | 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= srcW || ny >= srcH) continue;
                const k = ny * srcW + nx;
                if (srcAlpha[k * 4 + 3] < ALPHA_CUTOFF) continue;
                if (visited[k]) continue;
                const o = ownerOf[k];
                if (o === null) {
                  visited[k] = 1;
                  nq.push(k);
                } else {
                  votes.set(o, (votes.get(o) ?? 0) + 1);
                }
              }
            }
          }
          q = nq;
        }
        if (!votes.size) continue;
        const winner = [...votes.entries()].sort((a, b) => b[1] - a[1] || (depthOf.get(b[0]) ?? 0) - (depthOf.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))[0][0];
        let taken = 0;
        for (const j of mine) {
          const x = j % srcW, y = j / srcW | 0;
          if (inAnyBox(x, y)) continue;
          ownerOf[j] = winner;
          taken++;
        }
        if (!taken) continue;
        adopted += taken;
        adoptedBy.set(winner, (adoptedBy.get(winner) ?? 0) + taken);
      }
    }
    if (adopted) {
      const top = [...adoptedBy].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${c}px`).join("\uFF0C");
      console.log(`[\u5207\u56FE] \u22B9 \u8FDE\u901A\u6027\u8BA4\u9886 ${adopted}px \u843D\u5728\u6240\u6709\u6846\u5916\u7684\u5185\u5BB9\uFF08\u8DDF\u7740\u76F8\u63A5\u7684\u90E8\u4EF6\u8D70\uFF0C\u4E3B\u8981\u662F ${top}\uFF09`);
    }
  }
  let reseamed = 0;
  for (let pass = 0, n = 1; pass < SEAM_PASSES && n; pass++) {
    n = refineSeamOwnership(ownerOf, srcAlpha, srcW, srcH, depthOf);
    reseamed += n;
  }
  if (reseamed) console.log(`[\u5207\u56FE] \u2702 \u63A5\u7F1D\u4E0A ${reseamed}px \u989C\u8272\u5C5E\u4E8E\u540E\u5C42\uFF0C\u8FD8\u7ED9\u540E\u5C42\uFF08\u524D\u5C42\u5207\u53E3\u4E0D\u518D\u5E26\u4E00\u6761\u90BB\u4EF6\u7684\u989C\u8272\uFF09`);
  if (opts.pen !== false) {
    const snap2 = await snapOwnership(ownerOf, srcAlpha, srcW, srcH, depthOf);
    if (snap2.toBehind || snap2.toFront) {
      console.log(`[\u5207\u56FE] \u2712 \u5207\u53E3\u5438\u5230\u63CF\u7EBF\uFF1A${snap2.toBehind}px \u90BB\u4EF6\u8272\u8FD8\u7ED9\u540E\u5C42\uFF0C${snap2.toFront}px \u63CF\u7EBF\u6536\u56DE\u524D\u5C42`);
    }
  }
  const tidy = opts.cleanup === false ? { islandPx: 0, hairPx: 0, moved: /* @__PURE__ */ new Map(), islands: [] } : cleanupOwnership(ownerOf, srcW, srcH, { rgba: srcAlpha, foreignEdges: opts.foreignEdges !== false, depthOf: opts.halo ? depthOf : null });
  if (tidy.islandPx || tidy.hairPx || tidy.edgePx) {
    const top = [...tidy.moved].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${c}px`).join("\uFF0C");
    console.log(`[\u5207\u56FE] \u2702 \u6E05\u7406\u5F52\u5C5E\uFF1A\u5B64\u5C9B ${tidy.islandPx}px\u3001\u7EBF\u5934 ${tidy.hairPx}px\u3001\u6302\u9519\u7684\u90BB\u4EF6\u8FB9 ${tidy.edgePx ?? 0}px \u6539\u5224\u7ED9\u90BB\u4EF6\uFF08\u4E3B\u8981\u7ED9\u4E86 ${top}\uFF09`);
    for (const e of (tidy.edges ?? []).filter((e2) => e2.px >= 100).sort((a, b) => b.px - a.px)) {
      console.log(`[\u5207\u56FE]   \u90BB\u4EF6\u8FB9 ${e.from} \u2192 ${e.to} ${e.px}px`);
    }
    for (const i of tidy.islands.filter((i2) => i2.px >= 300)) {
      console.log(`[\u5207\u56FE]   ${i.from} \u7684 ${i.px}px\uFF08\u4E3B\u4F53\u7684 ${(i.ofLargest * 100).toFixed(0)}%\uFF09\u2192 ${i.to}`);
    }
  }
  const ownsBox = /* @__PURE__ */ new Map();
  if (growCap > 0) {
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const o = ownerOf[y * srcW + x];
        if (o === null) continue;
        const e = ownsBox.get(o);
        if (!e) ownsBox.set(o, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
        else {
          if (x < e.x0) e.x0 = x;
          if (y < e.y0) e.y0 = y;
          if (x >= e.x1) e.x1 = x + 1;
          if (y >= e.y1) e.y1 = y + 1;
        }
      }
    }
  }
  let grown = 0;
  for (const part of parts) {
    const b = part.bbox;
    const own = part.name != null ? ownsBox.get(part.name) : null;
    if (!b || !own) continue;
    const nx0 = Math.max(Math.round(b.x) - growCap, own.x0);
    const ny0 = Math.max(Math.round(b.y) - growCap, own.y0);
    const nx1 = Math.min(Math.round(b.x + b.width) + growCap, own.x1);
    const ny1 = Math.min(Math.round(b.y + b.height) + growCap, own.y1);
    const gx0 = Math.min(Math.round(b.x), nx0);
    const gy0 = Math.min(Math.round(b.y), ny0);
    const gx1 = Math.max(Math.round(b.x + b.width), nx1);
    const gy1 = Math.max(Math.round(b.y + b.height), ny1);
    if (gx0 === Math.round(b.x) && gy0 === Math.round(b.y) && gx1 === Math.round(b.x + b.width) && gy1 === Math.round(b.y + b.height)) continue;
    const before = `${Math.round(b.width)}x${Math.round(b.height)}`;
    part.bbox = { x: gx0, y: gy0, width: gx1 - gx0, height: gy1 - gy0 };
    grown++;
    const dL = Math.round(b.x) - gx0, dT = Math.round(b.y) - gy0;
    const dR = gx1 - Math.round(b.x + b.width), dB = gy1 - Math.round(b.y + b.height);
    console.log(`[\u5207\u56FE] \u21F1 ${part.name} \u7A97\u53E3\u6491\u5230\u5F52\u5C5E\u8303\u56F4 ${before} \u2192 ${part.bbox.width}x${part.bbox.height}\uFF08\u5DE6${dL} \u4E0A${dT} \u53F3${dR} \u4E0B${dB}\uFF09`);
  }
  if (grown) {
    console.log(`[\u5207\u56FE] \u21F1 ${grown}/${parts.length} \u4E2A\u90E8\u4EF6\u7684\u7A97\u53E3\u6309\u5F52\u5C5E\u8868\u6491\u5F00\u4E86\u2014\u2014\u8BA4\u9886\u5230\u6846\u5916\u7684\u5185\u5BB9\uFF0C\u5F97\u8BA9\u7A97\u53E3\u88C5\u5F97\u4E0B\u624D\u753B\u5F97\u51FA\u6765`);
  }
  const frontOf = /* @__PURE__ */ new Map();
  for (const part of parts) {
    const myDepth = depthOf.get(part.name);
    const ahead = parts.filter((o) => o !== part && depthOf.get(o.name) > myDepth && o.bbox && part.bbox && overlaps(part.bbox, o.bbox));
    frontOf.set(part.name, ahead);
  }
  const layered = [...frontOf.values()].filter((l) => l.length).length;
  const depthSpread = (/* @__PURE__ */ new Set([...depthOf.values()])).size;
  const polyCount = parts.filter((p) => Array.isArray(p.polygon) && p.polygon.length >= 3).length;
  console.log(`[\u5207\u56FE] \u5F00\u59CB\u5207\u56FE\uFF0C\u5171 ${parts.length} \u4E2A\u90E8\u4EF6\uFF08\u5916\u6269 ${margin}px\uFF0C\u6269\u6563 ${bleed} \u8F6E\uFF0C\u526A\u5F71\u5438\u9644 ${snap ? "\u5F00" : "\u5173"}\uFF09`);
  console.log(`[\u5207\u56FE] \u6DF1\u5EA6\u5171 ${depthSpread} \u5C42\uFF0C${layered} \u4E2A\u90E8\u4EF6\u9700\u8981\u64E6\u9664\u524D\u65B9\u5185\u5BB9`);
  console.log(`[\u5207\u56FE] ${polyCount}/${parts.length} \u4E2A\u90E8\u4EF6\u5E26\u591A\u8FB9\u5F62\u8F6E\u5ED3${polyCount < parts.length ? "\uFF08\u5176\u4F59\u9000\u56DE\u77E9\u5F62\u5207\u56FE\uFF09" : ""}`);
  if (depthSpread === 1 && parts.length > 1) {
    console.warn("[\u5207\u56FE] \u26A0 \u6240\u6709\u90E8\u4EF6\u5728\u540C\u4E00\u5C42\uFF0C\u4E0D\u4F1A\u64E6\u9664\u4EFB\u4F55\u5185\u5BB9\u2014\u2014AI \u6CA1\u7ED9\u51FA\u6709\u6548\u7684 depth");
  }
  for (const part of parts) {
    try {
      const { name } = part;
      const rawBbox = part.bbox;
      let bbox = rawBbox;
      if (!bbox || typeof bbox.x !== "number") {
        console.warn(`[\u5207\u56FE] \u90E8\u4EF6 ${name} \u7F3A\u5C11\u6709\u6548 bbox\uFF0C\u8DF3\u8FC7`);
        continue;
      }
      const poly = part.polygon;
      const hasPoly = Array.isArray(poly) && poly.length >= 3;
      const hasSam = samMasks.has(name);
      let snapped = null;
      if (snap && !hasPoly && !hasSam) {
        snapped = snapToSilhouette(src, srcW, srcH, bbox);
        if (snapped) {
          const before = `${Math.round(bbox.width)}x${Math.round(bbox.height)}`;
          bbox = snapped.bbox;
          const after = `${bbox.width}x${bbox.height}`;
          if (before !== after) console.log(`[\u5207\u56FE] \u21F2 ${name} \u5438\u9644 ${before} \u2192 ${after}`);
        }
      }
      if (hasPoly) {
        let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
        for (const p of poly) {
          if (p.x < px0) px0 = p.x;
          if (p.y < py0) py0 = p.y;
          if (p.x > px1) px1 = p.x;
          if (p.y > py1) py1 = p.y;
        }
        const ux = Math.min(bbox.x, px0);
        const uy = Math.min(bbox.y, py0);
        const ux1 = Math.max(bbox.x + bbox.width, px1);
        const uy1 = Math.max(bbox.y + bbox.height, py1);
        if (ux !== bbox.x || uy !== bbox.y || ux1 !== bbox.x + bbox.width || uy1 !== bbox.y + bbox.height) {
          bbox = { x: ux, y: uy, width: ux1 - ux, height: uy1 - uy };
          console.log(`[\u5207\u56FE] \u2B21 ${name} \u7A97\u53E3\u6491\u5230\u591A\u8FB9\u5F62\u8303\u56F4 ${Math.round(ux1 - ux)}x${Math.round(uy1 - uy)}`);
        }
      }
      const x0 = Math.max(0, Math.round(bbox.x) - margin);
      const y0 = Math.max(0, Math.round(bbox.y) - margin);
      const x1 = Math.min(srcW, Math.round(bbox.x + bbox.width) + margin);
      const y1 = Math.min(srcH, Math.round(bbox.y + bbox.height) + margin);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) {
        console.warn(`[\u5207\u56FE] \u90E8\u4EF6 ${name} \u5916\u6269\u540E\u5C3A\u5BF8\u975E\u6CD5\uFF0C\u8DF3\u8FC7`);
        continue;
      }
      const { data, info } = await sharp2(sourcePath).extract({ left: x0, top: y0, width: w, height: h }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const samMask = samMasks.get(name);
      const usedSam = !!samMask;
      const masked = Buffer.from(data);
      let kept = 0, given = 0;
      for (let y = 0; y < h; y++) {
        const srcRow = (y + y0) * srcW;
        for (let x = 0; x < w; x++) {
          const di = (y * w + x) * 4;
          const opaque = data[di + 3] >= ALPHA_CUTOFF;
          if (opaque && ownerOf[srcRow + x + x0] === name) {
            kept++;
            continue;
          }
          if (opaque) given++;
          masked[di] = 0;
          masked[di + 1] = 0;
          masked[di + 2] = 0;
          masked[di + 3] = 0;
        }
      }
      const polyMask = hasPoly ? fillPolygon(poly, w, h, x0, y0) : null;
      const rx0 = Math.round(bbox.x), ry0 = Math.round(bbox.y);
      const rx1 = Math.round(bbox.x + bbox.width), ry1 = Math.round(bbox.y + bbox.height);
      const myDepth = depthOf.get(name) ?? 0;
      let erasedMask = null;
      const erasedBy = /* @__PURE__ */ new Map();
      for (let y = 0; y < h; y++) {
        const srcRow = (y + y0) * srcW;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const si = srcRow + x + x0;
          const owner = ownerOf[si];
          if (owner === null || owner === name) continue;
          if ((depthOf.get(owner) ?? 0) <= myDepth) continue;
          const inShape = samMask || polyMask ? !!(samMask?.[si] || polyMask?.[i]) : x + x0 >= rx0 && x + x0 < rx1 && y + y0 >= ry0 && y + y0 < ry1;
          if (!inShape) continue;
          (erasedMask ??= new Uint8Array(w * h))[i] = 1;
          erasedBy.set(owner, (erasedBy.get(owner) ?? 0) + 1);
        }
      }
      const contourTag = usedSam ? "SAM" : hasPoly ? "\u591A\u8FB9\u5F62" : "\u77E9\u5F62";
      if (given) {
        console.log(`[\u5207\u56FE] \u2696 ${name}\uFF08${contourTag}\uFF09\u7559\u4E0B ${kept}px\uFF0C\u7A97\u53E3\u91CC ${given}px \u5F52\u522B\u7684\u90E8\u4EF6\uFF0C\u5DF2\u8BA9\u51FA`);
      }
      if (erasedMask) {
        const n = [...erasedBy.values()].reduce((s, v) => s + v, 0);
        const by = [...erasedBy].sort((a, b) => b[1] - a[1]).map(([o, c]) => `${o} ${c}px`).join("\uFF0C");
        console.log(`[\u5207\u56FE] \u232B ${name} \u88AB\u524D\u65B9\u90E8\u4EF6\u76D6\u4F4F ${n}px\uFF08${by}\uFF09\uFF0C\u4EA4\u7ED9\u8865\u56FE`);
      }
      const mine = new Uint8Array(w * h);
      const behind = new Uint8Array(w * h);
      const front = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const srcRow = (y + y0) * srcW;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (masked[i * 4 + 3]) {
            mine[i] = 1;
            continue;
          }
          const owner = ownerOf[srcRow + x + x0];
          if (data[i * 4 + 3] < ALPHA_CUTOFF || owner === null || owner === name) continue;
          const d = depthOf.get(owner) ?? 0;
          if (d < myDepth) behind[i] = 1;
          else if (d > myDepth) front[i] = 1;
        }
      }
      let smooth = featherFrontEdge(unmixBackEdge(masked, w, h, mine, front, data), w, h, mine, behind, data);
      if (opts.pen !== false) {
        const pen = await penEdge(smooth, w, h, mine, behind, data, { snap: false });
        smooth = pen.buf;
        if (pen.anchors) console.log(`[\u5207\u56FE] \u2712 ${name} \u5207\u53E3 ${pen.anchors} \u4E2A\u951A\u70B9`);
      }
      const filled = bleed > 0 ? bleedAlpha(smooth, info.width, info.height, bleed) : smooth;
      const outputPath = join(outputDir, `${name}.png`);
      await sharp2(filled, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(outputPath);
      const maskPath = join(outputDir, `${name}.mask.png`);
      {
        const mb = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (ownerOf[(y + y0) * srcW + x + x0] === name) mb[(y * w + x) * 4 + 3] = 255;
          }
        }
        await sharp2(mb, { raw: { width: w, height: h, channels: 4 } }).png().toFile(maskPath);
      }
      if (erasedMask) {
        const maskBuf = Buffer.alloc(w * h * 4);
        for (let i = 0; i < w * h; i++) if (erasedMask[i]) maskBuf[i * 4 + 3] = 255;
        await sharp2(maskBuf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(outputDir, `${name}.erased.png`));
      }
      const padX = Math.round(w * HIDDEN_PAD), padY = Math.round(h * HIDDEN_PAD);
      const hx0 = Math.max(0, x0 - padX), hy0 = Math.max(0, y0 - padY);
      const hx1 = Math.min(srcW, x1 + padX), hy1 = Math.min(srcH, y1 + padY);
      const hw = hx1 - hx0, hh = hy1 - hy0;
      let hiddenPath = null;
      {
        const hb = Buffer.alloc(hw * hh * 4);
        let n = 0;
        for (let y = 0; y < hh; y++) {
          for (let x = 0; x < hw; x++) {
            const owner = ownerOf[(y + hy0) * srcW + x + hx0];
            if (owner === null || owner === name) continue;
            if ((depthOf.get(owner) ?? 0) <= myDepth) continue;
            hb[(y * hw + x) * 4 + 3] = 255;
            n++;
          }
        }
        if (n) {
          hiddenPath = join(outputDir, `${name}.hidden.png`);
          await sharp2(hb, { raw: { width: hw, height: hh, channels: 4 } }).png().toFile(hiddenPath);
        }
      }
      let maskPolyIoU = null;
      if (samMask && hasPoly) {
        const pm = fillPolygon(poly, srcW, srcH, 0, 0);
        let inter = 0, uni = 0;
        for (let i = 0; i < pm.length; i++) {
          const a = samMask[i] ? 1 : 0, b = pm[i] ? 1 : 0;
          if (a && b) inter++;
          if (a || b) uni++;
        }
        maskPolyIoU = uni ? +(inter / uni).toFixed(3) : null;
      }
      const dx = Math.round(bbox.x) - x0;
      const dy = Math.round(bbox.y) - y0;
      const basePivot = part.pivot ?? { x: bbox.width / 2, y: bbox.height / 2 };
      console.log(`[\u5207\u56FE] \u2713 ${name}.png - ${w}x${h}\uFF08\u539F ${Math.round(bbox.width)}x${Math.round(bbox.height)}\uFF09`);
      results.push({
        name,
        path: outputPath,
        size: { width: w, height: h },
        bbox: { x: x0, y: y0, width: w, height: h },
        pivot: { x: basePivot.x + dx, y: basePivot.y + dy },
        margin: { left: dx, top: dy, right: x1 - Math.round(bbox.x + bbox.width), bottom: y1 - Math.round(bbox.y + bbox.height) },
        // AI 标注的遮挡方向，补图据此生成定向 prompt
        occlusionEdges: part.occlusion_edges ?? [],
        // 诊断用：吸附前后的框，供前端算出「AI 的框偏了多少」
        snapped: !!snapped,
        // 轮廓来源：'sam' = 像素级掩码，'polygon' = AI 顶点，'rect' = 纯矩形。
        // 靠这个区分「这张切图为什么干净（或为什么脏）」
        contour: usedSam ? "sam" : hasPoly ? "polygon" : "rect",
        // 始终带上吸附前的框：snap 关掉时它就是 AI 原框，
        // 开着时是 AI 原框、bbox 是收紧后的。两者的差就是 AI 的误差量
        originalBbox: { ...rawBbox },
        maskPath,
        // 归属掩码和 .erased.png 的窗口。补图会把 bbox 换成补完后的窗口，这里留住切图时的
        maskBox: { x: x0, y: y0, width: w, height: h },
        hiddenPath,
        hiddenBox: { x: hx0, y: hy0, width: hw, height: hh },
        maskPolyIoU
      });
    } catch (error) {
      console.error(`[\u5207\u56FE] \u2717 ${part.name} \u5931\u8D25:`, error.message);
    }
  }
  console.log(`[\u5207\u56FE] \u5B8C\u6210\uFF0C\u6210\u529F\u5207\u51FA ${results.length}/${parts.length} \u5F20\u56FE\u7247`);
  return results;
}
var SEAM_PASSES = 3;
var SEAM_MAX_RESIDUAL = 30;
var SEAM_MIN_CONTRAST = 40;
function mixFraction(rgba, width, height, x, y, inA, inB) {
  const sa = [0, 0, 0, 0], sb = [0, 0, 0, 0];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
      const j = ny * width + nx;
      for (const [inSet, acc] of [[inA, sa], [inB, sb]]) {
        if (!inSet(j) || !inSet(j - 1) || !inSet(j + 1) || !inSet(j - width) || !inSet(j + width)) continue;
        acc[0] += rgba[j * 4];
        acc[1] += rgba[j * 4 + 1];
        acc[2] += rgba[j * 4 + 2];
        acc[3]++;
      }
    }
  }
  if (sa[3] < 2 || sb[3] < 2) return null;
  let dot = 0, len = 0;
  const i = (y * width + x) * 4;
  for (let c = 0; c < 3; c++) {
    const a = sa[c] / sa[3], b = sb[c] / sb[3];
    dot += (rgba[i + c] - b) * (a - b);
    len += (a - b) * (a - b);
  }
  if (len < SEAM_MIN_CONTRAST * SEAM_MIN_CONTRAST) return null;
  const f = Math.min(1, Math.max(0, dot / len));
  let res = 0;
  for (let c = 0; c < 3; c++) {
    const a = sa[c] / sa[3], b = sb[c] / sb[3];
    res += (rgba[i + c] - (f * a + (1 - f) * b)) ** 2;
  }
  return {
    f,
    fits: res <= SEAM_MAX_RESIDUAL * SEAM_MAX_RESIDUAL,
    color: [0, 1, 2].map((c) => Math.round(sa[c] / sa[3])),
    other: [0, 1, 2].map((c) => Math.round(sb[c] / sb[3]))
  };
}
function featherFrontEdge(buf, width, height, mine, behind, src) {
  const out = Buffer.from(buf);
  const inMine = (j) => mine[j] === 1;
  const inBehind = (j) => behind[j] === 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mine[i] || !behind[i]) continue;
      let cov = 0, r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!mine[j]) continue;
          const k = (dx ? 1 : 2) * (dy ? 1 : 2);
          cov += k;
          r += k * buf[j * 4];
          g += k * buf[j * 4 + 1];
          b += k * buf[j * 4 + 2];
        }
      }
      if (!cov) continue;
      const m = mixFraction(src, width, height, x, y, inMine, inBehind);
      if (m && !m.fits) continue;
      const a = Math.round((m ? m.f : cov / 16) * src[i * 4 + 3]);
      if (!a) continue;
      const [cr, cg, cb] = m ? m.color : [r / cov, g / cov, b / cov];
      out[i * 4] = Math.round(cr);
      out[i * 4 + 1] = Math.round(cg);
      out[i * 4 + 2] = Math.round(cb);
      out[i * 4 + 3] = a;
    }
  }
  return out;
}
function unmixBackEdge(buf, width, height, mine, front, src) {
  const out = Buffer.from(buf);
  const inMine = (j) => mine[j] === 1;
  const inFront = (j) => front[j] === 1;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mine[i]) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (front[i + dy * width + dx]) {
        touches = true;
        break;
      }
      if (!touches) continue;
      const m = mixFraction(src, width, height, x, y, inFront, inMine);
      if (!m || !m.fits || m.f < 0.02) continue;
      out[i * 4] = m.other[0];
      out[i * 4 + 1] = m.other[1];
      out[i * 4 + 2] = m.other[2];
    }
  }
  return out;
}
function refineSeamOwnership(ownerOf, rgba, width, height, depthOf) {
  const moves = [];
  const depth = (n) => depthOf.get(n) ?? 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const p = ownerOf[i];
      if (p === null || rgba[i * 4 + 3] < ALPHA_CUTOFF) continue;
      let q = null;
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        const o = ownerOf[j];
        if (o !== null && o !== p && depth(o) < depth(p) && rgba[j * 4 + 3] >= ALPHA_CUTOFF) {
          q = o;
          break;
        }
      }
      if (q === null) continue;
      const m = mixFraction(rgba, width, height, x, y, (j) => ownerOf[j] === p, (j) => ownerOf[j] === q);
      if (m && m.fits && m.f < 0.5) moves.push([i, q]);
    }
  }
  for (const [i, q] of moves) ownerOf[i] = q;
  return moves.length;
}
function bleedAlpha(src, width, height, passes = DEFAULT_BLEED) {
  const buf = Buffer.from(src);
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    solid[i] = buf[i * 4 + 3] >= ALPHA_CUTOFF ? 1 : 0;
  }
  for (let pass = 0; pass < passes; pass++) {
    const added = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (solid[idx]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nidx = ny * width + nx;
            if (!solid[nidx]) continue;
            r += buf[nidx * 4];
            g += buf[nidx * 4 + 1];
            b += buf[nidx * 4 + 2];
            n++;
          }
        }
        if (!n) continue;
        added.push(idx);
        buf[idx * 4] = Math.round(r / n);
        buf[idx * 4 + 1] = Math.round(g / n);
        buf[idx * 4 + 2] = Math.round(b / n);
      }
    }
    if (!added.length) break;
    for (const idx of added) solid[idx] = 1;
  }
  return buf;
}
function applyCutGeometry(parts, cutResults) {
  const byName = new Map(cutResults.map((r) => [r.name, r]));
  return parts.map((p) => {
    const r = byName.get(p.name);
    if (!r?.bbox) return p;
    return { ...p, bbox: r.bbox, pivot: r.pivot ?? p.pivot };
  });
}
async function diagnoseAlignment(cutResults) {
  const out = [];
  for (const cut of cutResults) {
    try {
      const { data, info } = await sharp2(cut.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width: w, height: h } = info;
      let solid = 0;
      for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] >= ALPHA_CUTOFF) solid++;
      const fillRatio = solid / (w * h);
      const raw = cut.originalBbox;
      const drift = raw ? {
        x: Math.round(cut.bbox.x - raw.x),
        y: Math.round(cut.bbox.y - raw.y),
        width: Math.round(cut.bbox.width - raw.width),
        height: Math.round(cut.bbox.height - raw.height)
      } : null;
      const flags = [];
      if (typeof cut.maskPolyIoU === "number" && cut.maskPolyIoU < 0.5) {
        flags.push("SAM \u63A9\u7801\u548C AI \u8F6E\u5ED3\u91CD\u53E0\u4E0D\u5230\u4E00\u534A\uFF0C\u6846\u6216\u5206\u5272\u53EF\u80FD\u504F\u4E86");
      }
      if (drift && (Math.abs(drift.width) > w * 0.3 || Math.abs(drift.height) > h * 0.3)) {
        flags.push("AI \u7684\u6846\u6BD4\u5B9E\u9645\u5185\u5BB9\u5927\u5F88\u591A\uFF0C\u5DF2\u6309\u8F6E\u5ED3\u6536\u7D27");
      }
      out.push({
        name: cut.name,
        size: `${w}x${h}`,
        fillRatio: +fillRatio.toFixed(3),
        snapped: !!cut.snapped,
        drift,
        originalBbox: raw ? { ...raw } : null,
        bbox: { ...cut.bbox },
        flags
      });
    } catch (err) {
      out.push({ name: cut.name, error: err.message });
    }
  }
  return out;
}

// server/api/baseplate.js
import sharp3 from "sharp";
import { join as join2 } from "path";
var ALPHA_CUTOFF2 = 8;
var BASE_PLATE_NAME = "_base_plate";
var MIN_ORPHAN_RATIO = 5e-3;
async function buildBasePlate(sourcePath, cutResults, outputDir, opts = {}) {
  const { bleed = 2, onLog = () => {
  } } = opts;
  const { data: src, info } = await sharp3(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const opaque = new Uint8Array(W * H);
  let srcTotal = 0;
  for (let i = 0; i < W * H; i++) {
    if (src[i * 4 + 3] >= ALPHA_CUTOFF2) {
      opaque[i] = 1;
      srcTotal++;
    }
  }
  if (!srcTotal) {
    onLog("\u5E95\u677F\uFF1A\u6E90\u56FE\u6574\u5F20\u90FD\u662F\u900F\u660E\u7684\uFF0C\u8DF3\u8FC7", "info");
    return null;
  }
  const claimed = new Uint8Array(W * H);
  for (const cut of cutResults) {
    const { data: m, info: mi } = await sharp3(cut.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ox = Math.round(cut.bbox.x);
    const oy = Math.round(cut.bbox.y);
    for (let y = 0; y < mi.height; y++) {
      const cy = oy + y;
      if (cy < 0 || cy >= H) continue;
      for (let x = 0; x < mi.width; x++) {
        const cx = ox + x;
        if (cx < 0 || cx >= W) continue;
        if (m[(y * mi.width + x) * 4 + 3] >= ALPHA_CUTOFF2) claimed[cy * W + cx] = 1;
      }
    }
  }
  let orphan = 0;
  for (let i = 0; i < W * H; i++) if (opaque[i] && !claimed[i]) orphan++;
  const ratio = orphan / srcTotal;
  if (ratio < MIN_ORPHAN_RATIO) {
    onLog(
      `\u5E95\u677F\uFF1A\u65E0\u4EBA\u8BA4\u9886\u53EA\u6709 ${orphan}px\uFF08\u6E90\u56FE\u7684 ${(ratio * 100).toFixed(2)}%\uFF09\uFF0C\u90FD\u662F\u63CF\u8FB9\u7EA7\u7684\u788E\u5C51\uFF0C\u4E0D\u94FA\u5E95\u677F`,
      "info"
    );
    return null;
  }
  const plate = Buffer.alloc(W * H * 4);
  src.copy(plate);
  const holes = new Uint8Array(W * H);
  let holeN = 0;
  for (let i = 0; i < W * H; i++) {
    if (!claimed[i]) continue;
    plate[i * 4 + 3] = 0;
    if (opaque[i]) {
      holes[i] = 1;
      holeN++;
    }
  }
  const filled = bleed > 0 ? bleedAlpha(plate, W, H, bleed) : plate;
  const platePath = join2(outputDir, `${BASE_PLATE_NAME}.png`);
  await sharp3(filled, { raw: { width: W, height: H, channels: 4 } }).png().toFile(platePath);
  const maskPath = join2(outputDir, `${BASE_PLATE_NAME}.erased.png`);
  const maskBuf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) if (holes[i]) maskBuf[i * 4 + 3] = 255;
  await sharp3(maskBuf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(maskPath);
  onLog(
    `\u2713 \u5E95\u677F\uFF1A\u63A5\u4F4F ${orphan}px \u65E0\u4EBA\u8BA4\u9886\u7684\u5185\u5BB9\uFF08\u6E90\u56FE\u7684 ${(ratio * 100).toFixed(1)}%\uFF09\uFF0C\u53E6\u6807\u51FA ${holeN}px \u88AB\u90E8\u4EF6\u6316\u8D70\u7684\u7F3A\u53E3\u5F85\u8865`,
    "success"
  );
  return {
    name: BASE_PLATE_NAME,
    path: platePath,
    size: { width: W, height: H },
    // 整张画布。底板不做外扩也不吸附，坐标就是源图坐标
    bbox: { x: 0, y: 0, width: W, height: H },
    pivot: { x: W / 2, y: H / 2 },
    margin: { left: 0, top: 0, right: 0, bottom: 0 },
    occlusionEdges: [],
    snapped: false,
    contour: "base",
    originalBbox: { x: 0, y: 0, width: W, height: H },
    // 诊断用：这层到底接住了多少、还留了多少洞
    orphanPixels: orphan,
    holePixels: holeN
  };
}
function basePlatePart(width, height) {
  return {
    name: BASE_PLATE_NAME,
    parent: null,
    depth: -1,
    bbox: { x: 0, y: 0, width, height },
    pivot: { x: width / 2, y: height / 2 },
    occlusion_edges: []
  };
}

// server/api/background.js
import sharp4 from "sharp";

// server/api/matte-cleanup.js
function alphaStats(data, width, height) {
  let transparent = 0, soft = 0, opaque = 0, border = 0, clearBorder = 0;
  for (let k = 0; k < width * height; k++) {
    const a = data[k * 4 + 3];
    if (a <= 8) transparent++;
    else if (a < 255) soft++;
    else opaque++;
    const x = k % width, y = Math.floor(k / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      border++;
      if (a <= 8) clearBorder++;
    }
  }
  return {
    transparent,
    soft,
    opaque,
    transparentFraction: transparent / (width * height),
    borderTransparentFraction: clearBorder / Math.max(1, border),
    meaningfulAlpha: transparent + soft >= Math.max(1, Math.ceil(width * height * 1e-4)),
    hasClearBackground: transparent >= Math.max(1, Math.ceil(width * height * 1e-4))
  };
}
function parseMatteColor(value) {
  if (Array.isArray(value) && value.length === 3 && value.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return value.map(Math.round);
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  throw new Error("matte color \u5FC5\u987B\u4E3A #RRGGBB");
}
function inferTransparentMatte(data, width, height) {
  const groups = /* @__PURE__ */ new Map();
  const stride = Math.max(1, Math.floor(width * height / 5e4));
  let samples = 0;
  for (let k = 0; k < width * height; k += stride) {
    const i = k * 4;
    if (data[i + 3] > 8) continue;
    const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
    const group = groups.get(key) ?? { count: 0, rgb: [0, 0, 0] };
    group.count++;
    group.rgb[0] += data[i];
    group.rgb[1] += data[i + 1];
    group.rgb[2] += data[i + 2];
    groups.set(key, group);
    samples++;
  }
  const best = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  if (!best || best.count < samples * 0.6) return null;
  const color = best.rgb.map((v) => Math.round(v / best.count));
  return Math.max(...color) - Math.min(...color) >= 70 ? color : null;
}
function edgeDistances(data, width, height, limit) {
  const distance = new Uint8Array(width * height).fill(255), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  for (let k = 0; k < distance.length; k++) if (data[k * 4 + 3] <= 8) {
    distance[k] = 0;
    queue[tail++] = k;
  }
  while (head < tail) {
    const k = queue[head++], next = distance[k] + 1;
    if (next > limit) continue;
    const x = k % width, y = Math.floor(k / width);
    for (const n of [x > 0 ? k - 1 : -1, x + 1 < width ? k + 1 : -1, y > 0 ? k - width : -1, y + 1 < height ? k + width : -1]) {
      if (n < 0 || distance[n] <= next) continue;
      distance[n] = next;
      queue[tail++] = n;
    }
  }
  return distance;
}
var excess = (data, i, channel) => data[i + channel] - Math.max(data[i + (channel + 1) % 3], data[i + (channel + 2) % 3]);
function cleanMattePixels(data, width, height, background, options = {}) {
  const out = Buffer.from(data);
  if (!background) return { buffer: out, corrected: 0, clearedRgb: 0, spillBefore: 0, spillAfter: 0 };
  const radius = options.radius ?? Math.max(2, Math.min(8, Math.round(Math.max(width, height) / 128)));
  const search = options.searchRadius ?? radius + 4;
  const distance = edgeDistances(data, width, height, radius + search);
  const dominant = background.indexOf(Math.max(...background));
  const chromatic = Math.max(...background) - Math.min(...background) >= 70;
  let corrected = 0, clearedRgb = 0, spillBefore = 0, protectedColor = 0, unresolved = 0;
  const samples = [];
  for (let k = 0; k < width * height; k++) {
    const i = k * 4, alpha = data[i + 3];
    if (alpha <= 8) {
      if (out[i] || out[i + 1] || out[i + 2]) clearedRgb++;
      out[i] = out[i + 1] = out[i + 2] = 0;
      continue;
    }
    if (distance[k] > radius || chromatic && excess(data, i, dominant) <= 12) continue;
    if (chromatic && excess(data, i, dominant) > 25) spillBefore++;
    const x = k % width, y = Math.floor(k / width);
    let best = null, bestScore = Infinity, fallback = null, fallbackScore = Infinity;
    let nearestDeep = null, deepDistance = Infinity;
    for (let yy = Math.max(0, y - search); yy <= Math.min(height - 1, y + search); yy++) {
      for (let xx = Math.max(0, x - search); xx <= Math.min(width - 1, x + search); xx++) {
        const q = yy * width + xx, qi = q * 4, spatial = (x - xx) ** 2 + (y - yy) ** 2;
        if (data[qi + 3] < 250 || distance[q] < Math.min(3, distance[k] + 1)) continue;
        if (distance[q] > radius && spatial < deepDistance) {
          nearestDeep = qi;
          deepDistance = spatial;
        }
        if (chromatic && excess(data, qi, dominant) > 10) continue;
        let denominator = 0, numerator = 0, ff = 0, bb = 0, fb = 0, cf = 0, cb = 0;
        for (let c = 0; c < 3; c++) {
          const f = data[qi + c] - background[c];
          denominator += f * f;
          numerator += (data[i + c] - background[c]) * f;
          ff += data[qi + c] ** 2;
          bb += background[c] ** 2;
          fb += data[qi + c] * background[c];
          cf += data[i + c] * data[qi + c];
          cb += data[i + c] * background[c];
        }
        if (denominator < 40 ** 2) continue;
        const determinant = ff * bb - fb * fb;
        if (chromatic && determinant > 1) {
          const s = (cf * bb - cb * fb) / determinant, t = (cb * ff - cf * fb) / determinant;
          if (s > 0.01 && t > 0.01 && s + t <= 1.5) {
            let error2 = 0;
            for (let c = 0; c < 3; c++) error2 += (s * data[qi + c] + t * background[c] - data[i + c]) ** 2;
            const score2 = error2 + spatial * 0.3;
            if (error2 < 30 ** 2 && score2 < fallbackScore) {
              fallback = { qi };
              fallbackScore = score2;
            }
          }
        }
        const a2 = Math.max(0, Math.min(1, numerator / denominator));
        if (a2 > 0.985) continue;
        let error = 0;
        for (let c = 0; c < 3; c++) error += (background[c] + a2 * (data[qi + c] - background[c]) - data[i + c]) ** 2;
        const score = error + spatial * 0.3;
        if (error < (options.maxError ?? 60) ** 2 && score < bestScore) {
          best = { a: a2, qi };
          bestScore = score;
        }
      }
    }
    if (chromatic && nearestDeep !== null && excess(data, nearestDeep, dominant) > 18) {
      protectedColor++;
      continue;
    }
    if (!best && fallback) {
      out[i] = data[fallback.qi];
      out[i + 1] = data[fallback.qi + 1];
      out[i + 2] = data[fallback.qi + 2];
      corrected++;
      continue;
    }
    if (!best) {
      unresolved++;
      if (options.debug && samples.length < 12) samples.push({ x, y, rgba: [...data.subarray(i, i + 4)], distance: distance[k], nearestDeep: nearestDeep === null ? null : [...data.subarray(nearestDeep, nearestDeep + 4)] });
      continue;
    }
    const a = best.a;
    if (a < 0.025) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
    } else {
      for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(
        255,
        Math.round((data[i + c] - (1 - a) * background[c]) / a)
      ));
      if (chromatic) out[i + dominant] = Math.min(
        out[i + dominant],
        Math.max(out[i + (dominant + 1) % 3], out[i + (dominant + 2) % 3]) + Math.max(0, excess(data, best.qi, dominant))
      );
      out[i + 3] = Math.min(alpha, Math.round(a * 255));
    }
    corrected++;
  }
  let spillAfter = 0;
  if (chromatic) for (let k = 0; k < width * height; k++) {
    if (distance[k] <= radius && out[k * 4 + 3] > 8 && excess(out, k * 4, dominant) > 25) spillAfter++;
  }
  return { buffer: out, corrected, clearedRgb, spillBefore, spillAfter, protectedColor, unresolved, ...options.debug ? { samples } : {} };
}

// server/api/background.js
var DEFAULT_TOLERANCE = 18;
function isBackground(r, g, b, bg, tol) {
  if (Math.abs(r - bg[0]) > tol) return false;
  if (Math.abs(g - bg[1]) > tol) return false;
  if (Math.abs(b - bg[2]) > tol) return false;
  return true;
}
function detectBackground(data, width, height, channels, tolerance = DEFAULT_TOLERANCE) {
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1)
  ];
  let best = null;
  let bestVotes = 0;
  for (const c of corners) {
    let votes = 0;
    for (const o of corners) {
      if (Math.abs(c[0] - o[0]) <= tolerance && Math.abs(c[1] - o[1]) <= tolerance && Math.abs(c[2] - o[2]) <= tolerance) votes++;
    }
    if (votes > bestVotes) {
      bestVotes = votes;
      best = c;
    }
  }
  if (bestVotes < 2) return null;
  return best;
}
function allocRGBA(data, pixels, channels) {
  if (channels === 4) return Buffer.from(data);
  const out = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    if (channels === 1) {
      out[i * 4] = data[i];
      out[i * 4 + 1] = data[i];
      out[i * 4 + 2] = data[i];
    } else {
      out[i * 4] = data[i * channels];
      out[i * 4 + 1] = data[i * channels + 1];
      out[i * 4 + 2] = data[i * channels + 2];
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}
function removeBackgroundPixels(data, width, height, channels, options = {}) {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const bg = options.background ?? detectBackground(data, width, height, channels, tolerance);
  if (!bg) {
    return {
      buffer: allocRGBA(data, width * height, channels),
      width,
      height,
      cleared: 0,
      total: width * height,
      background: null,
      skipped: true
    };
  }
  const out = allocRGBA(data, width * height, channels);
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let sp = 0;
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (seen[idx]) return;
    const i = idx * channels;
    if (!isBackground(data[i], data[i + 1], data[i + 2], bg, tolerance)) return;
    seen[idx] = 1;
    stack[sp++] = idx;
  };
  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }
  let cleared = 0;
  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % width;
    const y = (idx - x) / width;
    out[idx * 4 + 3] = 0;
    cleared++;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }
  return {
    buffer: out,
    width,
    height,
    cleared,
    total: width * height,
    background: bg,
    skipped: false
  };
}
async function removeBackground(inputPath, options = {}) {
  const { data, info } = await sharp4(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const before = alphaStats(data, info.width, info.height);
  const mode = options.mode ?? "auto";
  if (!["auto", "transparent", "preserve"].includes(mode)) throw new Error("background mode \u5FC5\u987B\u662F auto\u3001transparent \u6216 preserve");
  if (mode === "transparent" && !before.hasClearBackground) throw new Error("\u6E90\u56FE\u6CA1\u6709\u771F\u5B9E\u900F\u660E\u533A\u57DF\uFF1Aalpha \u901A\u9053\u6216\u753B\u51FA\u6765\u7684\u68CB\u76D8\u683C\u90FD\u4E0D\u7B49\u4E8E\u900F\u660E\u80CC\u666F");
  if (mode === "preserve") return { skipped: true, reason: "preserved", width: info.width, height: info.height, transparency: { before, after: before, mode } };
  const explicitMatte = options.matteColor ? parseMatteColor(options.matteColor) : null;
  const result = before.meaningfulAlpha ? {
    buffer: data,
    width: info.width,
    height: info.height,
    total: info.width * info.height,
    cleared: 0,
    background: explicitMatte ?? inferTransparentMatte(data, info.width, info.height),
    skipped: false
  } : removeBackgroundPixels(data, info.width, info.height, info.channels, {
    ...options,
    ...explicitMatte ? { background: explicitMatte } : {}
  });
  if (result.skipped) {
    return { skipped: true, reason: "no-uniform-background", width: info.width, height: info.height, transparency: { before, after: before, mode } };
  }
  const feather = cleanMattePixels(result.buffer, result.width, result.height, explicitMatte ?? result.background, options);
  const after = alphaStats(feather.buffer, result.width, result.height);
  const transparency = {
    before,
    after,
    mode,
    matte: explicitMatte ?? result.background,
    correctedEdgePixels: feather.corrected,
    spillBefore: feather.spillBefore,
    spillAfter: feather.spillAfter
  };
  if (before.meaningfulAlpha && !feather.corrected && !feather.clearedRgb) {
    return { skipped: true, reason: "already-transparent", width: info.width, height: info.height, transparency };
  }
  const buffer = await sharp4(feather.buffer, {
    raw: { width: result.width, height: result.height, channels: info.channels }
  }).png({ compressionLevel: 9 }).toBuffer();
  return {
    skipped: false,
    buffer,
    width: result.width,
    height: result.height,
    background: result.background,
    cleared: result.cleared,
    ratio: result.cleared / result.total,
    feathered: feather.corrected,
    transparency
  };
}

// server/api/mesh.js
var MAX_INFLUENCES = 4;
var BLEND_SPAN = 0.4;
var SOLID_SPAN = 0.2;
function buildSkinnedMesh(part, parentPart, opts = {}) {
  const density = opts.density ?? 8;
  const bb = part.bbox;
  const pivot0 = part.pivot ?? { x: bb.width / 2, y: bb.height / 2 };
  const joint = parentPart ? jointFrame(part, parentPart, pivot0) : null;
  const outer = sampleOutline(bb, density);
  const innerSteps = Math.max(2, Math.floor(density / 3));
  const inner = sampleInterior(bb, innerSteps);
  const points = [...outer, ...inner];
  const vertices = [];
  const uvs = [];
  const weights = [];
  const pivot = part.pivot ?? { x: bb.width / 2, y: bb.height / 2 };
  for (const p of points) {
    vertices.push(p.x, -p.y);
    uvs.push(p.x / bb.width, p.y / bb.height);
    weights.push(computeWeight(p, joint));
  }
  const triangles = triangulate(points, outer.length, innerSteps);
  const offset = {
    x: -pivot.x,
    y: pivot.y
  };
  return { vertices, uvs, triangles, weights, offset, hull: outer.length };
}
function estimateJoint(part, parentPart) {
  const a = part.bbox;
  const b = parentPart.bbox;
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const dx = ac.x - bc.x;
  const dy = ac.y - bc.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: ac.x - a.x, y: ac.y - a.y };
  }
  const halfW = a.width / 2;
  const halfH = a.height / 2;
  const scaleX = Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY, 1);
  const jx = ac.x - dx * t;
  const jy = ac.y - dy * t;
  return { x: jx - a.x, y: jy - a.y };
}
function jointFrame(part, parentPart, pivot) {
  const bb = part.bbox;
  const c = { x: bb.width / 2, y: bb.height / 2 };
  const diag = Math.hypot(bb.width, bb.height);
  let origin = pivot;
  if (Math.hypot(c.x - pivot.x, c.y - pivot.y) < diag * 0.08) origin = estimateJoint(part, parentPart);
  let dx = c.x - origin.x;
  let dy = c.y - origin.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: origin.x, y: origin.y, dir: null, solid: 0, span: 0 };
  }
  dx /= len;
  dy /= len;
  let far = 0;
  for (const [px, py] of [[0, 0], [bb.width, 0], [bb.width, bb.height], [0, bb.height]]) {
    far = Math.max(far, (px - origin.x) * dx + (py - origin.y) * dy);
  }
  return {
    x: origin.x,
    y: origin.y,
    dir: { x: dx, y: dy },
    solid: far * SOLID_SPAN,
    span: Math.max(1, far * BLEND_SPAN)
  };
}
function computeWeight(point, joint) {
  if (!joint) {
    return [{ boneIndex: 0, weight: 1 }];
  }
  let wParent;
  if (!joint.dir) {
    wParent = 0.5;
  } else {
    const d = (point.x - joint.x) * joint.dir.x + (point.y - joint.y) * joint.dir.y;
    const t = Math.max(0, Math.min(1, (d - joint.solid) / joint.span));
    wParent = 1 - t * t * (3 - 2 * t);
  }
  if (wParent > 0.999) return [{ boneIndex: 0, weight: 1 }];
  if (wParent < 1e-3) return [{ boneIndex: 1, weight: 1 }];
  const wp = +wParent.toFixed(4);
  return [
    { boneIndex: 0, weight: wp },
    { boneIndex: 1, weight: +(1 - wp).toFixed(4) }
  ];
}
function sampleOutline(bb, density) {
  const pts = [];
  const { width: w, height: h } = bb;
  const edgeCounts = [
    Math.max(1, Math.round(density * (w / (w + h)))),
    // 上边
    Math.max(1, Math.round(density * (h / (w + h)))),
    // 右边
    Math.max(1, Math.round(density * (w / (w + h)))),
    // 下边
    Math.max(1, Math.round(density * (h / (w + h))))
    // 左边
  ];
  for (let i = 0; i < edgeCounts[0]; i++) {
    pts.push({ x: w * i / edgeCounts[0], y: 0 });
  }
  for (let i = 0; i < edgeCounts[1]; i++) {
    pts.push({ x: w, y: h * i / edgeCounts[1] });
  }
  for (let i = 0; i < edgeCounts[2]; i++) {
    pts.push({ x: w - w * i / edgeCounts[2], y: h });
  }
  for (let i = 0; i < edgeCounts[3]; i++) {
    pts.push({ x: 0, y: h - h * i / edgeCounts[3] });
  }
  return pts;
}
function sampleInterior(bb, steps) {
  const pts = [];
  const { width: w, height: h } = bb;
  for (let i = 1; i <= steps; i++) {
    for (let j = 1; j <= steps; j++) {
      pts.push({ x: w * i / (steps + 1), y: h * j / (steps + 1) });
    }
  }
  return pts;
}
function triangulate(points, hullCount, steps) {
  const tris = [];
  const EPS = 1e-6;
  const emit = (a, b, c) => {
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    const area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
    if (Math.abs(area) < EPS) return;
    if (area > 0) tris.push(a, c, b);
    else tris.push(a, b, c);
  };
  const gridCount = steps * steps;
  const hasGrid = steps >= 2 && points.length >= hullCount + gridCount;
  if (!hasGrid) {
    for (let k = 1; k < hullCount - 1; k++) emit(0, k, k + 1);
    return tris;
  }
  const gi = (i, j) => hullCount + (i - 1) * steps + (j - 1);
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const a = gi(i, j);
      const b = gi(i + 1, j);
      const c = gi(i + 1, j + 1);
      const d = gi(i, j + 1);
      emit(a, b, c);
      emit(a, c, d);
    }
  }
  const innerRing = [];
  for (let i = 1; i < steps; i++) innerRing.push(gi(i, 1));
  for (let j = 1; j < steps; j++) innerRing.push(gi(steps, j));
  for (let i = steps; i > 1; i--) innerRing.push(gi(i, steps));
  for (let j = steps; j > 1; j--) innerRing.push(gi(1, j));
  const outerRing = [];
  for (let k = 0; k < hullCount; k++) outerRing.push(k);
  stitchRings(points, outerRing, innerRing, emit);
  return tris;
}
function stitchRings(points, outerRing, innerRing, emit) {
  const TAU = Math.PI * 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const idx of outerRing) {
    const p = points[idx];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const first = points[outerRing[0]];
  const base = Math.atan2(first.y - cy, first.x - cx) - 1e-9;
  const uOf = (idx) => {
    const p = points[idx];
    let a = (Math.atan2(p.y - cy, p.x - cx) - base) % TAU;
    if (a < 0) a += TAU;
    return a;
  };
  const rotateToMin = (ring) => {
    let m = 0;
    let best = uOf(ring[0]);
    for (let k = 1; k < ring.length; k++) {
      const u = uOf(ring[k]);
      if (u < best) {
        best = u;
        m = k;
      }
    }
    return ring.slice(m).concat(ring.slice(0, m));
  };
  const O = rotateToMin(outerRing);
  const I = rotateToMin(innerRing);
  const uO = O.map(uOf);
  const uI = I.map(uOf);
  let oi = 0;
  let ii = 0;
  while (oi < O.length || ii < I.length) {
    const nO = oi >= O.length ? Infinity : oi + 1 < O.length ? uO[oi + 1] : TAU;
    const nI = ii >= I.length ? Infinity : ii + 1 < I.length ? uI[ii + 1] : TAU;
    const curO = O[oi % O.length];
    const curI = I[ii % I.length];
    if (nO <= nI) {
      emit(curO, O[(oi + 1) % O.length], curI);
      oi++;
    } else {
      emit(curO, curI, I[(ii + 1) % I.length]);
      ii++;
    }
  }
}
function shouldSkin(part, parentPart) {
  if (!part.bbox) return false;
  if (!parentPart?.bbox) return false;
  return true;
}

// server/api/connected-skin.js
function connectSkin(skeleton, parts, bounds, density = 8, { blinkEyes = [], meshParts } = {}) {
  const visible = parts.filter((part) => part.bbox && !part.name.startsWith("_"));
  if (!visible.length) return;
  const step = Math.max(8, Math.max(bounds.width, bounds.height) / (Math.max(3, density) * 4));
  const ox = bounds.x + bounds.width / 2;
  const oy = bounds.y + bounds.height / 2;
  const xs = gridAxis(
    bounds.x,
    bounds.width,
    visible.map((p) => [p.bbox.x, p.bbox.x + p.bbox.width]),
    step,
    blinkEyes.flatMap((eye) => [-0.95, -0.6, -0.5, 0, 0.5, 0.6, 0.95].map((t) => eye.x + eye.width / 2 + eye.width * t))
  );
  const ys = gridAxis(
    bounds.y,
    bounds.height,
    visible.map((p) => [p.bbox.y, p.bbox.y + p.bbox.height]),
    step,
    blinkEyes.flatMap((eye) => {
      const cy = eye.y + eye.height / 2, h = eye.height / 2;
      return [-h - 7, -h - 1, -h, 0, h, h + 1, h + 7].map((t) => cy + t);
    })
  );
  const grid = /* @__PURE__ */ new Map();
  const point = (i, j) => {
    const key = `${i},${j}`;
    if (!grid.has(key)) {
      const x = xs[i], y = ys[j];
      const owner = ownerAt(visible, x, y);
      grid.set(key, { x, y, bind: /* @__PURE__ */ new Map([[owner.name, {
        w: 1,
        x: x - ox,
        y: oy - y,
        blink: blinkShift(x, y, blinkEyes)
      }]]) });
    }
    return grid.get(key);
  };
  const attachments = skeleton.skins[0].attachments;
  const targets = meshParts ?? visible;
  for (const part of targets) {
    const bb = part.bbox;
    if (!(bb.width > 0 && bb.height > 0)) continue;
    const pivot = part.pivot ?? { x: bb.width / 2, y: bb.height / 2 };
    const points = [], triangles = [], ids = /* @__PURE__ */ new Map();
    const add = (p) => {
      const key = `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
      if (!ids.has(key)) {
        ids.set(key, points.length);
        points.push(p);
      }
      return ids.get(key);
    };
    for (let j = 0; j + 1 < ys.length; j++) {
      if (ys[j + 1] <= bb.y || ys[j] >= bb.y + bb.height) continue;
      for (let i = 0; i + 1 < xs.length; i++) {
        if (xs[i + 1] <= bb.x || xs[i] >= bb.x + bb.width) continue;
        const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
        for (const triangle of [[a, d, b], [b, d, c]]) {
          const polygon = clipRect(triangle, bb);
          for (let k = 1; k + 1 < polygon.length; k++) {
            const [p, q, r] = [polygon[0], polygon[k], polygon[k + 1]];
            if (Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) < 1e-8) continue;
            triangles.push(add(p), add(q), add(r));
          }
        }
      }
    }
    const boundary = (p) => Math.min(
      Math.abs(p.x - bb.x),
      Math.abs(p.x - bb.x - bb.width),
      Math.abs(p.y - bb.y),
      Math.abs(p.y - bb.y - bb.height)
    ) < 1e-6;
    const perimeter = (p) => {
      if (Math.abs(p.y - bb.y) < 1e-6) return p.x - bb.x;
      if (Math.abs(p.x - bb.x - bb.width) < 1e-6) return bb.width + p.y - bb.y;
      if (Math.abs(p.y - bb.y - bb.height) < 1e-6) return bb.width + bb.height + bb.x + bb.width - p.x;
      return 2 * (bb.width + bb.height) - (p.y - bb.y);
    };
    const outer = points.map((p, i) => i).filter((i) => boundary(points[i])).sort((a, b) => perimeter(points[a]) - perimeter(points[b]));
    const order = [...outer, ...points.map((p, i) => i).filter((i) => !boundary(points[i]))];
    const remap = new Map(order.map((old, i) => [old, i]));
    const mesh = {
      type: "mesh",
      name: part.name,
      path: `${part.name}.png`,
      width: bb.width,
      height: bb.height,
      x: -pivot.x,
      y: pivot.y,
      vertices: [],
      uvs: [],
      bones: [],
      weights: [],
      bindPositions: [],
      triangles: triangles.map((i) => remap.get(i)),
      hull: outer.length
    };
    const blinkOffsets = [];
    for (const index of order) {
      const p = points[index];
      mesh.vertices.push(p.x - bb.x, bb.y - p.y);
      mesh.uvs.push((p.x - bb.x) / bb.width, (p.y - bb.y) / bb.height);
      const influences = [...p.bind].filter(([, inf]) => inf.w > 1e-10);
      mesh.bones.push(influences.map(([name]) => name));
      mesh.weights.push(influences.map(([, inf]) => inf.w));
      mesh.bindPositions.push(influences.map(([, inf]) => [inf.x / inf.w, inf.y / inf.w]));
      for (const [, inf] of influences) blinkOffsets.push(0, (inf.blink ?? 0) / inf.w);
    }
    if (blinkOffsets.some((value) => Math.abs(value) > 1e-7)) mesh.blinkOffsets = blinkOffsets;
    attachments[`${part.name}_slot`] ??= {};
    attachments[`${part.name}_slot`][part.name] = mesh;
  }
  skeleton.stats = {
    ...skeleton.stats,
    connectedSkin: true,
    skinnedParts: targets.length,
    regionParts: skeleton.slots.length - targets.length
  };
}
function gridAxis(origin, size, ranges, step, extra) {
  const min = Math.floor((Math.min(origin, ...ranges.map((r) => r[0])) - origin) / step);
  const max = Math.ceil((Math.max(origin + size, ...ranges.map((r) => r[1])) - origin) / step);
  const points = Array.from({ length: max - min + 1 }, (_, i) => origin + (min + i) * step);
  const sorted = [...points, ...extra.filter((p) => p > points[0] && p < points[points.length - 1])].sort((a, b) => a - b);
  return sorted.filter((p, i) => i === 0 || p - sorted[i - 1] > 1e-7);
}
function blinkShift(x, y, eyes) {
  let shift = 0;
  const fade = (distance, solid, end) => {
    const t = Math.max(0, Math.min(1, (distance - solid) / (end - solid)));
    return 1 - t * t * (3 - 2 * t);
  };
  for (const eye of eyes) {
    const dx = x - eye.x - eye.width / 2, dy = y - eye.y - eye.height / 2;
    shift += dy * 0.935 * fade(Math.abs(dx), eye.width * 0.6, eye.width * 0.95) * fade(Math.abs(dy), eye.height / 2 + 1, eye.height / 2 + 7);
  }
  return shift;
}
function inside(polygon, x, y) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > y !== b.y > y && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function ownerAt(parts, x, y) {
  let owner, bestDepth = -Infinity, nearest, bestDistance = Infinity;
  for (const part of parts) {
    const bb = part.bbox;
    const contains = part.polygon?.length >= 3 ? inside(part.polygon, x, y) : x >= bb.x && x <= bb.x + bb.width && y >= bb.y && y <= bb.y + bb.height;
    if (contains && (part.depth ?? 0) > bestDepth) {
      owner = part;
      bestDepth = part.depth ?? 0;
    }
    const dx = Math.max(bb.x - x, 0, x - bb.x - bb.width);
    const dy = Math.max(bb.y - y, 0, y - bb.y - bb.height);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      nearest = part;
      bestDistance = distance;
    }
  }
  return owner ?? nearest;
}
function mix(a, b, t) {
  const bind = /* @__PURE__ */ new Map();
  for (const [source, factor] of [[a, 1 - t], [b, t]]) {
    for (const [name, inf] of source.bind) {
      const value = bind.get(name) ?? { w: 0, x: 0, y: 0, blink: 0 };
      value.w += inf.w * factor;
      value.x += inf.x * factor;
      value.y += inf.y * factor;
      value.blink += (inf.blink ?? 0) * factor;
      bind.set(name, value);
    }
  }
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, bind };
}
function clipRect(triangle, bb) {
  let polygon = triangle;
  for (const [axis, edge, sign] of [
    ["x", bb.x, 1],
    ["x", bb.x + bb.width, -1],
    ["y", bb.y, 1],
    ["y", bb.y + bb.height, -1]
  ]) {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const ain = (a[axis] - edge) * sign >= -1e-9, bin2 = (b[axis] - edge) * sign >= -1e-9;
      if (ain) out.push(a);
      if (ain !== bin2) out.push(mix(a, b, (edge - a[axis]) / (b[axis] - a[axis])));
    }
    polygon = out;
    if (!polygon.length) break;
  }
  return polygon;
}

// server/api/generator.js
function generateSkeleton(analysis, spineVersion = "4.0", options = {}) {
  const { parts } = analysis;
  const density = options.density ?? 8;
  const versionMap = {
    "3.8": "3.8.99",
    "4.0": "4.0.64",
    "4.1": "4.1.23",
    "4.2": "4.2.10"
  };
  const fullVersion = versionMap[spineVersion] || versionMap["4.0"];
  const sortedParts = topologicalSort(parts);
  const bounds = computeBounds(analysis, options.imageSize);
  const originX = bounds.x + bounds.width / 2;
  const originY = bounds.y + bounds.height / 2;
  const toSpine = (px, py) => ({ x: px - originX, y: originY - py });
  const bboxOf = (part) => {
    const bb = part.bbox;
    if (!bb) return null;
    const left = bb.x;
    const right = bb.x + bb.width;
    const bottom = bb.y + bb.height;
    return { left, right, bottom };
  };
  const attachments = {};
  const skeleton = {
    skeleton: {
      hash: generateHash(),
      spine: fullVersion,
      images: "./images",
      audio: null
    },
    bones: [],
    slots: [],
    // Spine 3.8 起 skins 是数组 [{ name, attachments }]。
    // 之前写成对象 { default: {...} }，运行时按 length 遍历，
    // 结果一个附件都读不到——蒙皮网格等于没生效。
    skins: [
      {
        name: "default",
        attachments
      }
    ],
    animations: {}
  };
  const absAnchor = /* @__PURE__ */ new Map();
  let skinnedCount = 0;
  const takenNames = new Set(parts.map((p) => p.name));
  let rootBoneName = "root";
  for (let i = 1; takenNames.has(rootBoneName); i++) rootBoneName = `root_${i}`;
  skeleton.bones.push({ name: rootBoneName, x: 0, y: 0 });
  for (const part of sortedParts) {
    const bb = part.bbox ?? { x: 0, y: 0, width: 100, height: 100 };
    const pivot = part.pivot ?? { x: bb.width / 2, y: bb.height / 2 };
    const pivotPx = { x: bb.x + pivot.x, y: bb.y + pivot.y };
    const anchor = toSpine(pivotPx.x, pivotPx.y);
    absAnchor.set(part.name, anchor);
    const parentAnchor = part.parent ? absAnchor.get(part.parent) : null;
    const bone = { name: part.name };
    bone.parent = part.parent || rootBoneName;
    bone.x = parentAnchor ? anchor.x - parentAnchor.x : anchor.x;
    bone.y = parentAnchor ? anchor.y - parentAnchor.y : anchor.y;
    skeleton.bones.push(bone);
    const slotName = `${part.name}_slot`;
    skeleton.slots.push({
      name: slotName,
      bone: part.name,
      attachment: part.name
    });
    const corners = bboxOf(part);
    let regionX = 0;
    let regionY = 0;
    if (corners) {
      const offsetX = pivotPx.x - (corners.left + corners.right) / 2;
      const offsetY = pivotPx.y - (bb.y + corners.bottom) / 2;
      regionX = -offsetX;
      regionY = offsetY;
    }
    const parentPart = part.parent ? parts.find((p) => p.name === part.parent) : null;
    if (options.skin !== false && shouldSkin(part, parentPart)) {
      const mesh = buildSkinnedMesh(part, parentPart, { density });
      const boneNames = [part.parent, part.name];
      const weighted = mesh.weights.map((influences) => {
        const names = influences.map((inf) => boneNames[inf.boneIndex]);
        const ws = influences.map((inf) => inf.weight);
        while (names.length < MAX_INFLUENCES) {
          names.push(part.name);
          ws.push(0);
        }
        return { bones: names, weights: ws };
      });
      attachments[slotName] = {
        [part.name]: {
          type: "mesh",
          name: part.name,
          path: `${part.name}.png`,
          width: bb.width,
          height: bb.height,
          uvs: mesh.uvs.map((v) => +v.toFixed(5)),
          triangles: mesh.triangles,
          hull: mesh.hull,
          vertices: mesh.vertices.map((v) => +v.toFixed(2)),
          // 把顶点从绝对顶点空间搬回骨骼原点
          x: +mesh.offset.x.toFixed(2),
          y: +mesh.offset.y.toFixed(2),
          // Spine 的 mesh 附件按顶点存权重，每个顶点最多 4 条骨骼影响
          bones: weighted.map((w) => w.bones),
          weights: weighted.map((w) => w.weights)
        }
      };
      skinnedCount++;
    } else {
      attachments[slotName] = {
        [part.name]: {
          type: "region",
          name: part.name,
          path: `${part.name}.png`,
          width: bb.width,
          height: bb.height,
          x: regionX,
          y: regionY
        }
      };
    }
  }
  const depthOf = (slot) => {
    const part = sortedParts.find((p) => `${p.name}_slot` === slot.name);
    return typeof part?.depth === "number" ? part.depth : 0;
  };
  skeleton.slots = skeleton.slots.map((slot, i) => ({ slot, i, d: depthOf(slot) })).sort((a, b) => a.d - b.d || a.i - b.i).map((e) => e.slot);
  skeleton.stats = { skinnedParts: skinnedCount, regionParts: sortedParts.length - skinnedCount };
  if (options.skin !== false && options.connectedSkin) connectSkin(skeleton, parts, bounds, density);
  return skeleton;
}
function computeBounds(analysis, imageSize) {
  if (imageSize?.width && imageSize?.height) {
    return { x: 0, y: 0, width: imageSize.width, height: imageSize.height };
  }
  const boxes = (analysis.parts ?? []).map((p) => p.bbox).filter(Boolean);
  if (!boxes.length) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
var BASE_PLATE = "_base_plate";
var LEG_RE = /thigh|shin|leg|calf|knee|ankle|foot|feet|boot|shoe|sock|stocking|sandal|sneaker|toe|pants|trouser|腿|脚|足|靴|鞋|袜|膝|裤/i;
var BREATH_PERIOD = 3;
var BREATH_STEPS = 24;
var HEAD_SWAY_DEG = 0.6;
var BREATH_RISE_RATIO = 0.013;
function generateAnimations(skeleton) {
  const bones = skeleton.bones ?? [];
  if (!bones.length) return skeleton;
  const root = bones.find((b) => !b.parent) ?? bones[0];
  const byName = new Map(bones.map((b) => [b.name, b]));
  const parentOf = (b) => b?.parent ? byName.get(b.parent) : null;
  const isTop = (b) => b.parent === root.name;
  const skip = (b) => b === root || b.name === BASE_PLATE;
  const genOf = (b) => {
    let g = 0;
    for (let cur = b; cur && !isTop(cur) && cur !== root && g < bones.length; cur = parentOf(cur)) g++;
    return g;
  };
  const spine = skeleton.skeleton?.spine ?? "4.0";
  const rotKey = spine.startsWith("3.") ? "angle" : "value";
  const skins = skeleton.skins;
  const atts = (Array.isArray(skins) ? skins[0]?.attachments : skins?.default) ?? {};
  const attOf = (b) => b ? atts[`${b.name}_slot`]?.[b.name] ?? null : null;
  const world = /* @__PURE__ */ new Map();
  for (const b of bones) {
    const p = world.get(b.parent) ?? { x: 0, y: 0 };
    world.set(b.name, { x: p.x + (b.x ?? 0), y: p.y + (b.y ?? 0) });
  }
  const extent = /* @__PURE__ */ new Map();
  for (const b of bones) {
    if (skip(b)) continue;
    const e = extentOf(attOf(b), world.get(b.name));
    if (e) extent.set(b.name, e);
  }
  const exts = [...extent.values()];
  const ground = exts.length ? Math.min(...exts.map((e) => e.bottom)) : 0;
  const height = exts.length ? Math.max(...exts.map((e) => e.top)) - ground : 0;
  const touchesGround = (b) => (extent.get(b.name)?.bottom ?? Infinity) <= ground + height * 0.03;
  const footish = (b) => touchesGround(b) && extent.get(b.name).top < ground + height / 2;
  const legs = /* @__PURE__ */ new Set();
  for (const b of bones) {
    if (skip(b) || isTop(b)) continue;
    if (LEG_RE.test(b.name) || footish(b) || legs.has(b.parent)) legs.add(b.name);
  }
  const noRotate = new Set(legs);
  for (const name of legs) {
    for (let cur = parentOf(byName.get(name)), n = 0; cur && !isTop(cur) && !skip(cur) && n < bones.length; n++, cur = parentOf(cur)) {
      noRotate.add(cur.name);
    }
  }
  const rise = height > 0 ? Math.min(28, Math.max(4, Math.round(height * BREATH_RISE_RATIO))) : 4;
  const stretch = height > 0 ? rise / height : 0;
  const breath = (u) => (1 - Math.cos(u * Math.PI * 2)) / 2;
  const track = (fn) => sine(BREATH_PERIOD, BREATH_STEPS, fn);
  const idle = { bones: {} };
  if (stretch > 0) {
    idle.bones[root.name] = {
      scale: track((u) => ({ x: 1, y: +(1 + stretch * breath(u)).toFixed(5) })),
      translate: track((u) => ({ x: 0, y: +(-ground * stretch * breath(u)).toFixed(3) }))
    };
  }
  const legTop = Math.max(-Infinity, ...bones.filter((b) => legs.has(b.name) && extent.has(b.name)).map((b) => extent.get(b.name).top));
  for (const b of bones) {
    if (skip(b) || isTop(b) || noRotate.has(b.name)) continue;
    const pw = attOf(parentOf(b))?.width ?? 0;
    if (pw > 0 && Math.abs(b.x ?? 0) >= pw * 0.15) continue;
    if ((extent.get(b.name)?.bottom ?? Infinity) < legTop) continue;
    if (genOf(b) !== 1) continue;
    const e = extent.get(b.name), pe = extent.get(parentOf(b)?.name);
    if (!e || !pe || (e.top + e.bottom) / 2 <= pe.top) continue;
    const angle = (u) => HEAD_SWAY_DEG * Math.sin((u - 0.1) * Math.PI * 2);
    idle.bones[b.name] = { rotate: track((u) => ({ [rotKey]: +angle(u).toFixed(3) })) };
  }
  skeleton.animations = { idle };
  return skeleton;
}
function sine(duration, steps, fn) {
  const keys = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    keys.push({ time: +(t * duration).toFixed(3), ...fn(t) });
  }
  return keys;
}
function extentOf(att, boneWorld) {
  if (!att || !boneWorld) return null;
  const oy = att.y ?? 0;
  let lo = -(att.height ?? 0) / 2;
  let hi = (att.height ?? 0) / 2;
  if (att.type === "mesh" && att.vertices?.length) {
    lo = Infinity;
    hi = -Infinity;
    for (let i = 1; i < att.vertices.length; i += 2) {
      lo = Math.min(lo, att.vertices[i]);
      hi = Math.max(hi, att.vertices[i]);
    }
  }
  return { bottom: boneWorld.y + oy + lo, top: boneWorld.y + oy + hi };
}
function topologicalSort(parts) {
  const sorted = [];
  const visited = /* @__PURE__ */ new Set();
  function visit(part) {
    if (visited.has(part.name)) return;
    visited.add(part.name);
    if (part.parent) {
      const parent = parts.find((p) => p.name === part.parent);
      if (parent) visit(parent);
    }
    sorted.push(part);
  }
  for (const part of parts) {
    visit(part);
  }
  return sorted;
}
function generateHash() {
  return Math.random().toString(36).substring(2, 15);
}
async function exportToSpine(skeleton, sourceDir, name = "generated", opts = {}) {
  const { mkdir: mkdir7, writeFile: writeFile4, copyFile } = await import("fs/promises");
  const { join: join10, basename: basename4, dirname: dirname5 } = await import("path");
  const { buildExportSkeleton: buildExportSkeleton2, resolveTarget: resolveTarget2 } = await Promise.resolve().then(() => (init_targets(), targets_exports));
  const { packAtlas: packAtlas2 } = await Promise.resolve().then(() => (init_atlas(), atlas_exports));
  const { buildSpineProject: buildSpineProject2 } = await Promise.resolve().then(() => (init_spine_project(), spine_project_exports));
  const { SPINE_PROJECT_DIR: SPINE_PROJECT_DIR2 } = await Promise.resolve().then(() => (init_workspace(), workspace_exports));
  const target = resolveTarget2(opts.target);
  const cutResults = opts.cutResults ?? [];
  const projectDir = join10(sourceDir, target.id, name);
  const imagesDir = join10(projectDir, "images");
  await mkdir7(imagesDir, { recursive: true });
  const { json, stats } = buildExportSkeleton2(skeleton, target.id);
  const skeletonPath = join10(projectDir, `${name}.json`);
  await writeFile4(skeletonPath, JSON.stringify(json, null, 2), "utf-8");
  let atlas = null;
  if (cutResults.length) {
    try {
      atlas = await packAtlas2(cutResults, projectDir, {
        name,
        spineVersion: target.atlasVersion
      });
    } catch (err) {
      console.warn(`[\u5BFC\u51FA] \u56FE\u96C6\u6253\u5305\u5931\u8D25\uFF1A${err.message}`);
    }
    for (const cut of cutResults) {
      if (!cut.path) continue;
      try {
        await copyFile(cut.path, join10(imagesDir, basename4(cut.path)));
      } catch {
      }
    }
  }
  const spineDir = join10(sourceDir, SPINE_PROJECT_DIR2);
  await mkdir7(spineDir, { recursive: true });
  const spinePath = join10(spineDir, `${name}.spine`);
  const projJson = {
    ...json,
    skeleton: { ...json.skeleton, images: opts.spineImagesPath ?? "./images/", audio: "" }
  };
  const projJsonPath = join10(spineDir, `${name}.project.json`);
  await writeFile4(projJsonPath, JSON.stringify(projJson, null, 2), "utf-8");
  let spineProject = null;
  try {
    spineProject = opts.skipSpineProject ? { ok: false, reason: "\u53EF\u7F16\u8F91 .spine \u6E90\u5DE5\u7A0B\u9700\u8981\u5B89\u88C5 Spine \u7F16\u8F91\u5668\u5E76\u4F7F\u7528 --editable" } : await buildSpineProject2({
      jsonPath: projJsonPath,
      outPath: spinePath,
      name,
      cliPath: opts.spineCliPath
    });
  } catch (err) {
    spineProject = { ok: false, reason: err.message };
  } finally {
    try {
      const { rm: rm3 } = await import("fs/promises");
      await rm3(projJsonPath, { force: true });
    } catch {
    }
  }
  await writeFile4(join10(projectDir, "README.txt"), readmeFor({
    name,
    target,
    stats,
    atlas,
    count: cutResults.length,
    spineProject
  }), "utf-8");
  return {
    skeletonPath,
    name,
    projectDir,
    parentDir: dirname5(projectDir),
    /*
     * 本次导出的根：<输入图名>/。
     *
     * 产物清单要从这一层列，Spine工程/ 和各目标目录才会一起出现——
     * 用户点完导出最想确认的就是"那个 .spine 到底有没有"。
     * 用 parentDir 列只能看到目标目录里的三件套，正好把 .spine 漏掉。
     */
    exportRoot: sourceDir,
    imagesDir,
    target: { id: target.id, label: target.label, spine: target.spineHeader },
    spineProject: spineProject?.ok ? { path: spinePath } : { path: null, reason: spineProject?.reason ?? "\u672A\u751F\u6210" },
    atlas: atlas && {
      atlasPath: atlas.atlasPath,
      pagePath: atlas.pagePath,
      page: atlas.page,
      regions: atlas.regions.length
    },
    stats,
    message: `\u5DF2\u5BFC\u51FA ${target.label} \u5DE5\u7A0B\uFF1A${projectDir}`
  };
}
function readmeFor({ name, target, stats, atlas, count, spineProject }) {
  const files = [
    `- ${name}.json   \u9AA8\u67B6\uFF08${target.label} / spine ${target.spineHeader}\uFF09`,
    atlas ? `- ${name}.atlas  \u56FE\u96C6\u63CF\u8FF0\uFF08${atlas.regions.length} \u4E2A\u533A\u57DF\uFF09` : null,
    atlas ? `- ${name}.png    \u56FE\u96C6\u9875 ${atlas.page.width}x${atlas.page.height}` : null,
    `- images/            ${count} \u5F20\u6563\u56FE\uFF08\u56DE\u7F16\u8F91\u5668\u6539\u7F51\u683C\u65F6\u7528\uFF09`
  ].filter(Boolean).join("\n");
  return `Spine \u5DE5\u7A0B: ${name}
\u5BFC\u51FA\u76EE\u6807: ${target.label}
\u9AA8\u67B6\u7248\u672C: ${target.spineHeader}
\u7F51\u683C: ${stats.meshCount} \u4E2A\uFF08\u5176\u4E2D\u52A0\u6743 ${stats.weightedCount} \u4E2A\uFF09
\u751F\u6210\u65F6\u95F4: ${(/* @__PURE__ */ new Date()).toLocaleString("zh-CN")}

\u6587\u4EF6:
${files}

\u4E8C\u6B21\u7F16\u8F91:
${spineProject?.ok ? `- \u4E0A\u4E00\u5C42\u7684 Spine\u5DE5\u7A0B/${name}.spine \u662F\u53EF\u76F4\u63A5\u7528 Spine \u6253\u5F00\u7684\u6E90\u5DE5\u7A0B\uFF0C
  \u6539\u5B8C\u7F51\u683C/\u52A8\u753B\u540E\u4ECE\u7F16\u8F91\u5668\u91CC\u91CD\u65B0\u5BFC\u51FA\uFF0C\u5C31\u80FD\u8986\u76D6\u672C\u76EE\u5F55\u7684\u6570\u636E` : `- \u672C\u6B21\u6CA1\u6709\u751F\u6210 .spine \u6E90\u5DE5\u7A0B\uFF08${spineProject?.reason ?? "\u672A\u77E5\u539F\u56E0"}\uFF09\u3002
  \u9700\u8981\u624B\u5DE5\u8C03\u6574\u7684\u8BDD\uFF0C\u53EF\u4EE5\u5728 Spine \u91CC\u65B0\u5EFA\u5DE5\u7A0B\u518D\u5BFC\u5165\u672C\u76EE\u5F55\u7684 ${name}.json`}

${target.note}
`;
}

// server/api/motion-core.js
var BAKE_FPS = 30;
var MAX_DURATION = 30;
var CHARACTER_MAX_DEG = 10;
var EASES = {
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  inOut: (u) => (1 - Math.cos(Math.PI * u)) / 2,
  // 过冲回弹：先冲过头约 10% 再落回
  back: (u) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2;
  }
};
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var num = (v, d) => typeof v === "number" && Number.isFinite(v) ? v : d;
var round = (v, n) => +v.toFixed(n);
function summarizeParts(parts) {
  return (parts ?? []).filter((p) => p?.name && !p.name.startsWith("_")).map((p) => ({
    name: p.name,
    parent: p.parent ?? null,
    bbox: {
      x: Math.round(p.bbox.x),
      y: Math.round(p.bbox.y),
      width: Math.round(p.bbox.width),
      height: Math.round(p.bbox.height)
    },
    pivot: {
      x: Math.round(p.bbox.x + (p.pivot?.x ?? p.bbox.width / 2)),
      y: Math.round(p.bbox.y + (p.pivot?.y ?? p.bbox.height / 2))
    }
  }));
}
function bakeChannel(rawKeys, duration, read, write) {
  const keys = (Array.isArray(rawKeys) ? rawKeys : []).filter((k) => k && typeof k === "object").map((k) => ({ t: clamp(num(k.t ?? k.time, 0), 0, duration), ease: k.ease, vals: read(k) })).sort((a, b) => a.t - b.t);
  const dedup = [];
  for (const k of keys) {
    if (dedup.length && Math.abs(dedup[dedup.length - 1].t - k.t) < 1e-6) dedup[dedup.length - 1] = k;
    else dedup.push(k);
  }
  const out = [];
  for (let i = 0; i < dedup.length; i++) {
    const a = dedup[i], b = dedup[i + 1];
    out.push(write(round(a.t, 4), a.vals));
    if (!b) break;
    if (a.ease === "step") {
      const hold = b.t - 1 / (BAKE_FPS * 10);
      if (hold > a.t) out.push(write(round(hold, 4), a.vals));
      continue;
    }
    const fn = EASES[a.ease];
    if (!fn || fn === EASES.linear) continue;
    const span = b.t - a.t;
    const steps = Math.floor(span * BAKE_FPS);
    for (let s = 1; s < steps; s++) {
      const u = s / steps;
      const e = fn(u);
      out.push(write(round(a.t + span * u, 4), a.vals.map((v, j) => v + (b.vals[j] - v) * e)));
    }
  }
  return out;
}
var alphaHex = (a) => "ffffff" + Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, "0");
function bakeMotion(motion, skeleton, opts = {}) {
  if (motion?.none === true) return { none: true, name: null, duration: 0, animation: null, warnings: [], skipped: [] };
  const warnings = [];
  const duration = clamp(num(motion?.duration, 0) || 0, 0, MAX_DURATION);
  const spine = skeleton.skeleton?.spine ?? "4.0";
  const legacy = spine.startsWith("3.");
  const rotKey = legacy ? "angle" : "value";
  const colorKey = legacy ? "color" : "rgba";
  const bones = new Map((skeleton.bones ?? []).map((b) => [b.name, b]));
  const root = (skeleton.bones ?? []).find((b) => !b.parent);
  const slotOf = new Map((skeleton.slots ?? []).map((s) => [s.bone, s.name]));
  const size = opts.imageSize ? Math.max(opts.imageSize.width, opts.imageSize.height) : 4096;
  const maxMove = size * 4;
  const character = opts.category === "character";
  let end = duration;
  for (const tr of motion?.tracks ?? []) {
    for (const ch of ["translate", "rotate", "scale", "alpha"]) {
      for (const k of Array.isArray(tr?.[ch]) ? tr[ch] : []) end = Math.max(end, num(k?.t ?? k?.time, 0));
    }
  }
  end = clamp(end, 0, MAX_DURATION) || 1;
  const animation = { bones: {}, slots: {} };
  for (const tr of motion?.tracks ?? []) {
    const name = tr?.part;
    const bone = bones.get(name);
    if (!bone || bone === root || name?.startsWith("_")) {
      warnings.push(`\u6CA1\u6709\u53EB ${name} \u7684\u90E8\u4EF6\uFF0C\u8FD9\u6761\u8F68\u9053\u5DF2\u5FFD\u7565`);
      continue;
    }
    const child = character && bone.parent !== root?.name;
    const out = {};
    if (tr.translate?.length) {
      if (child) warnings.push(`${name} \u662F\u89D2\u8272\u7684\u5B50\u90E8\u4EF6\uFF0C\u76F8\u5BF9\u4F4D\u79FB\u4F1A\u8BA9\u63A5\u7F1D\u88C2\u5F00\uFF0C\u5DF2\u53BB\u6389\u4F4D\u79FB`);
      else out.translate = bakeChannel(
        tr.translate,
        end,
        (k) => [clamp(num(k.x, 0), -maxMove, maxMove), clamp(num(k.y, 0), -maxMove, maxMove)],
        (time, [x, y]) => ({ time, x: round(x, 2), y: round(-y, 2) })
      );
    }
    if (tr.rotate?.length) {
      const lim = child ? CHARACTER_MAX_DEG : 1080;
      if (child && tr.rotate.some((k) => Math.abs(num(k?.deg, 0)) > lim)) {
        warnings.push(`${name} \u662F\u89D2\u8272\u7684\u5B50\u90E8\u4EF6\uFF0C\u8F6C\u89D2\u5939\u5230 \xB1${lim}\xB0\uFF0C\u518D\u5927\u63A5\u7F1D\u4F1A\u88C2\u5F00`);
      }
      out.rotate = bakeChannel(
        tr.rotate,
        end,
        (k) => [clamp(num(k.deg ?? k.value ?? k.angle, 0), -lim, lim)],
        // 图片里顺时针为正，Spine 里逆时针为正
        (time, [d]) => ({ time, [rotKey]: round(-d, 3) || 0 })
      );
    }
    if (tr.scale?.length) {
      if (child) warnings.push(`${name} \u662F\u89D2\u8272\u7684\u5B50\u90E8\u4EF6\uFF0C\u76F8\u5BF9\u7F29\u653E\u4F1A\u8BA9\u63A5\u7F1D\u88C2\u5F00\uFF0C\u5DF2\u53BB\u6389\u7F29\u653E`);
      else out.scale = bakeChannel(
        tr.scale,
        end,
        (k) => {
          const s = num(k.s, 1);
          return [clamp(num(k.x, s), -10, 10), clamp(num(k.y, s), -10, 10)];
        },
        (time, [x, y]) => ({ time, x: round(x, 4), y: round(y, 4) })
      );
    }
    for (const ch of Object.keys(out)) if (!out[ch].length) delete out[ch];
    if (Object.keys(out).length) animation.bones[name] = out;
    if (tr.alpha?.length) {
      const slot = slotOf.get(name);
      const keys = bakeChannel(
        tr.alpha,
        end,
        (k) => [clamp(num(k.a ?? k.alpha, 1), 0, 1)],
        (time, [a]) => ({ time, color: alphaHex(a) })
      );
      if (slot && keys.length) animation.slots[slot] = { [colorKey]: keys };
    }
  }
  let last = 0, lastKeys = null;
  const scan = (tracks) => {
    for (const tr of Object.values(tracks)) for (const keys of Object.values(tr)) {
      const t = keys[keys.length - 1]?.time ?? 0;
      if (t >= last) {
        last = t;
        lastKeys = keys;
      }
    }
  };
  scan(animation.bones);
  scan(animation.slots);
  if (lastKeys && last < end) lastKeys.push({ ...lastKeys[lastKeys.length - 1], time: round(end, 4) });
  const userName = String(opts.name ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32);
  let animName = userName && !/^_+$/.test(userName) ? userName : "";
  if (!animName) {
    animName = String(motion?.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
    if (!animName || animName === "idle" || /^_+$/.test(animName)) animName = "motion";
  }
  const skipped = (Array.isArray(motion?.skipped) ? motion.skipped : []).filter((s) => s && (s.what || s.reason)).map((s) => ({ what: String(s.what ?? ""), reason: String(s.reason ?? "") }));
  return { name: animName, duration: end, animation, warnings, skipped };
}
function applyMotion(skeleton, baked) {
  const rest = { ...skeleton.animations ?? {} };
  delete rest[baked.name];
  skeleton.animations = { [baked.name]: baked.animation, ...rest };
  return skeleton;
}

// server/api/blink.js
import sharp6 from "sharp";
async function detectEyes(cutResults) {
  const head = cutResults.find((cut) => /(?:head|face|头|脸)/i.test(cut.name));
  if (!head?.path || !head.bbox) throw new Error("\u6CA1\u6709\u627E\u5230\u8138\u90E8\u5207\u7247\uFF0C\u8BF7\u5148\u751F\u6210\u5305\u542B\u5934\u90E8\u7684\u89D2\u8272");
  const { data, info } = await sharp6(head.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const mask = new Uint8Array(w * h);
  for (let y = Math.floor(h * 0.35); y < h * 0.9; y++) {
    for (let x = Math.floor(w * 0.15); x < w * 0.85; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 200 && Math.max(data[i], data[i + 1], data[i + 2]) < 145 && data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 < 115) mask[y * w + x] = 1;
    }
  }
  const candidates = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    const queue = [start];
    mask[start] = 0;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q], x = p % w, y = Math.floor(p / w);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) continue;
        mask[ny * w + nx] = 0;
        queue.push(ny * w + nx);
      }
    }
    const width = maxX - minX + 1, height = maxY - minY + 1;
    if (queue.length < Math.max(20, w * h * 1e-3) || width < w * 0.03 || width > w * 0.23 || height < h * 0.04 || height > h * 0.25) continue;
    candidates.push({ x: minX, y: minY, width, height, area: queue.length });
  }
  let pair, best = -Infinity;
  for (const a of candidates) for (const b of candidates) {
    const dx = b.x + b.width / 2 - a.x - a.width / 2;
    const dy = Math.abs(b.y + b.height / 2 - a.y - a.height / 2);
    if (dx < w * 0.18 || dx > w * 0.65 || dy > h * 0.08 || Math.min(a.area, b.area) / Math.max(a.area, b.area) < 0.4) continue;
    const score = a.area + b.area - dy * 20;
    if (score > best) {
      pair = [a, b];
      best = score;
    }
  }
  if (!pair) throw new Error("\u65E0\u6CD5\u53EF\u9760\u5B9A\u4F4D\u53CC\u773C\uFF0C\u5F53\u524D\u529F\u80FD\u9700\u8981\u6E05\u6670\u7684\u6B63\u9762\u6DF1\u8272\u773C\u775B");
  return pair.map(({ x, y, width, height }) => ({
    x: head.bbox.x + x * head.bbox.width / w,
    y: head.bbox.y + y * head.bbox.height / h,
    width: width * head.bbox.width / w,
    height: height * head.bbox.height / h
  }));
}
function blinkTimelines(skeleton) {
  const attachments = skeleton.skins[0].attachments;
  for (const animation of Object.values(skeleton.animations ?? {})) {
    const duration = Math.max(
      0.5,
      ...Object.values(animation.bones ?? {}).flatMap((track) => Object.values(track).filter(Array.isArray).flatMap((keys) => keys.map((key) => key.time ?? 0))),
      ...Object.values(animation.slots ?? {}).flatMap((track) => Object.values(track).filter(Array.isArray).flatMap((keys) => keys.map((key) => key.time ?? 0)))
    );
    const close = duration * 0.6;
    for (const [slot, meshes] of Object.entries(attachments)) for (const [name, mesh] of Object.entries(meshes)) {
      if (!mesh.blinkOffsets) continue;
      const values = mesh.blinkOffsets;
      const first = values.findIndex((value) => Math.abs(value) > 1e-7);
      let last = values.length - 1;
      while (last >= first && Math.abs(values[last]) < 1e-7) last--;
      const offset = Math.floor(first / 2) * 2;
      const vertices = values.slice(offset, Math.ceil((last + 1) / 2) * 2).map((v) => +v.toFixed(6));
      const keys = [
        { time: 0 },
        { time: +(close - 0.08).toFixed(4) },
        { time: +close.toFixed(4), offset, vertices },
        { time: +(close + 0.04).toFixed(4), offset, vertices },
        { time: +(close + 0.14).toFixed(4) },
        { time: duration }
      ];
      animation.deform ??= {};
      animation.deform.default ??= {};
      animation.deform.default[slot] ??= {};
      animation.deform.default[slot][name] = keys;
    }
  }
}
function bindBlink(skeleton, parts, imageSize, density, eyes, meshParts) {
  connectSkin(skeleton, parts, { x: 0, y: 0, ...imageSize }, density, { blinkEyes: eyes, meshParts });
  skeleton.blink = { eyes, ...meshParts ? { regions: parts, meshes: meshParts } : {} };
  if (!Object.keys(skeleton.animations ?? {}).length) skeleton.animations = { idle: { bones: { root: {
    translate: [{ time: 0, x: 0, y: 0 }, { time: 3, x: 0, y: 0 }]
  } } } };
  blinkTimelines(skeleton);
}
async function addBlink(skeleton, cutResults, imageSize, density = 8) {
  const eyes = await detectEyes(cutResults);
  const parts = cutResults.map((cut) => ({
    name: cut.name,
    bbox: cut.bbox,
    pivot: cut.pivot,
    polygon: cut.polygon,
    depth: skeleton.slots.findIndex((slot) => slot.bone === cut.name)
  }));
  bindBlink(skeleton, parts, imageSize, density, eyes);
  return eyes;
}

// agent/engine.ts
init_workspace();
init_targets();

// agent/segmentation.ts
import { resolve as resolve2, dirname, join as join5 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stat as stat2 } from "node:fs/promises";
import { spawn } from "node:child_process";
var samRoot = resolve2(dirname(fileURLToPath(import.meta.url)), "../server/sam");
var load = (name) => import(pathToFileURL(join5(samRoot, name)).href);
async function samStatus() {
  const [mobile, sam3] = await Promise.all([load("client.mjs"), load("client-sam3.mjs")]);
  const mobilePaths = mobile.paths(), sam3Paths = sam3.sam3Paths();
  const size = (path) => stat2(path).then((file) => file.size, () => 0);
  return {
    mobilesam: { available: new mobile.SamClient().checkEnv(), home: mobilePaths.home, weightBytes: await size(mobilePaths.weights) },
    sam3: { available: new sam3.Sam3Client().checkEnv(), home: sam3Paths.home, weightBytes: await size(sam3Paths.weights) }
  };
}
function chooseSegmentation(mode, status) {
  if (!["auto", "polygon", "mobilesam", "sam3", "mesh"].includes(mode)) throw new Error("segmentation \u5FC5\u987B\u662F auto\u3001polygon\u3001mobilesam\u3001sam3 \u6216 mesh");
  if (mode === "polygon" || mode === "mesh") return mode;
  if (mode !== "auto") {
    if (!status[mode].available) throw new Error(`${mode} \u672A\u5B89\u88C5\uFF1B\u8BF7\u8FD0\u884C sam-setup --segmentation ${mode}`);
    return mode;
  }
  return status.mobilesam.available ? "mobilesam" : status.sam3.available ? "sam3" : "polygon";
}
async function segmentationBackend(mode) {
  if (mode === "polygon" || mode === "mesh") return mode;
  return chooseSegmentation(mode, await samStatus());
}
async function segment(image, parts, requested, backend, onLog) {
  const report = { requested, backend, samParts: [], polygonParts: [], elapsedMs: 0 };
  if (backend === "polygon" || backend === "mesh") {
    if (backend === "polygon") report.polygonParts = parts.map((part) => part.name);
    if (requested === "auto" && backend === "polygon") report.note = "\u672A\u5B89\u88C5\u672C\u5730 SAM\uFF0C\u4F7F\u7528\u591A\u8FB9\u5F62\u8F6E\u5ED3";
    return { masks: null, report };
  }
  const [segmentation, mobile, sam3] = await Promise.all([load("segment.mjs"), load("client.mjs"), load("client-sam3.mjs")]);
  const started = performance.now();
  try {
    const masks = await segmentation.segmentParts(image, parts, {
      useSam: true,
      segmenter: backend,
      requireEnv: true,
      onLog: (message) => onLog(message)
    });
    if (!masks?.size) throw new Error(`${backend} \u672A\u5F97\u5230\u53EF\u7528\u63A9\u7801`);
    report.samParts = parts.filter((part) => masks.has(part.name)).map((part) => part.name);
    report.maskBackends = Object.fromEntries([...masks].map(([name, mask]) => [name, mask.via ?? backend]));
    report.polygonParts = parts.filter((part) => !masks.has(part.name)).map((part) => part.name);
    report.elapsedMs = Math.round(performance.now() - started);
    if (report.polygonParts.length) report.note = `${report.polygonParts.length} \u4E2A\u90E8\u4EF6\u4F7F\u7528\u591A\u8FB9\u5F62\u56DE\u9000`;
    return { masks, report };
  } catch (error) {
    if (requested !== "auto") throw error;
    report.backend = "polygon";
    report.polygonParts = parts.map((part) => part.name);
    report.elapsedMs = Math.round(performance.now() - started);
    report.note = `${backend} \u8FD0\u884C\u5931\u8D25\uFF0C\u4F7F\u7528\u591A\u8FB9\u5F62\uFF1A${error instanceof Error ? error.message : String(error)}`;
    return { masks: null, report };
  } finally {
    mobile.stopSamClient();
    sam3.stopSam3Client();
  }
}
async function setupSam(backend) {
  if (!["mobilesam", "sam3"].includes(backend)) throw new Error("sam-setup \u9700\u8981 --segmentation mobilesam \u6216 sam3");
  const entry = join5(samRoot, backend === "mobilesam" ? "setup.mjs" : "setup-sam3.mjs");
  const child = spawn(process.execPath, [entry], { stdio: ["ignore", process.stderr, process.stderr] });
  await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? done() : reject(new Error(`${backend} \u5B89\u88C5\u5931\u8D25 (${code})`)));
  });
  const status = await samStatus();
  if (!status[backend].available) throw new Error(`${backend} \u5B89\u88C5\u5B8C\u6210\u540E\u73AF\u5883\u4ECD\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u68C0\u67E5\u5B89\u88C5\u65E5\u5FD7`);
  return status;
}

// agent/engine.ts
var categories = /* @__PURE__ */ new Set(["character", "prop", "effect", "item", "ui"]);
var safePart = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
var isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function fail(message) {
  throw new Error(message);
}
function normalizePlan(input, size) {
  if (!isRecord(input) || !["normalized", "pixels"].includes(String(input.units))) fail("analysis.units \u5FC5\u987B\u662F normalized \u6216 pixels");
  if (!categories.has(String(input.category))) fail("analysis.category \u5FC5\u987B\u662F character/prop/effect/item/ui");
  if (!Array.isArray(input.parts) || input.parts.length < 1 || input.parts.length > 60) fail("parts \u6570\u91CF\u5FC5\u987B\u5728 1\u201360 \u4E4B\u95F4");
  if (input.imageSize && (!isRecord(input.imageSize) || input.imageSize.width !== size.width || input.imageSize.height !== size.height)) fail("\u65B9\u6848\u7684 imageSize \u4E0E\u5B9E\u9645\u8F93\u5165\u56FE\u7247\u4E0D\u4E00\u81F4");
  const plan = structuredClone(input);
  const warnings = [];
  const names = /* @__PURE__ */ new Set();
  for (const part of plan.parts) {
    if (!isRecord(part) || !safePart.test(part.name) || names.has(part.name)) fail("\u90E8\u4EF6\u540D\u79F0\u5FC5\u987B\u552F\u4E00\uFF0C\u5E76\u4F7F\u7528\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001_ \u6216 -\uFF08\u4EE5\u5B57\u6BCD\u5F00\u5934\uFF09");
    names.add(part.name);
    if (part.parent !== null && typeof part.parent !== "string") fail(`${part.name}: parent \u5FC5\u987B\u662F\u90E8\u4EF6\u540D\u6216 null`);
    if (!Number.isInteger(part.depth) || part.depth < 0) fail(`${part.name}: depth \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570`);
    const bb = part.bbox;
    if (!isRecord(bb) || ![bb.x, bb.y, bb.width, bb.height].every(finite) || bb.width <= 0 || bb.height <= 0) fail(`${part.name}: bbox \u65E0\u6548`);
    const w = plan.units === "normalized" ? 1 : size.width;
    const h = plan.units === "normalized" ? 1 : size.height;
    if (bb.x < 0 || bb.y < 0 || bb.x + bb.width > w + 1e-6 || bb.y + bb.height > h + 1e-6) fail(`${part.name}: bbox \u8D85\u51FA\u56FE\u7247\u8FB9\u754C`);
    if (!isRecord(part.pivot) || ![part.pivot.x, part.pivot.y].every(finite)) fail(`${part.name}: pivot \u65E0\u6548`);
    const pw = plan.units === "normalized" ? 1 : bb.width, ph = plan.units === "normalized" ? 1 : bb.height;
    if (part.pivot.x < 0 || part.pivot.y < 0 || part.pivot.x > pw || part.pivot.y > ph) fail(`${part.name}: pivot \u5FC5\u987B\u76F8\u5BF9\u4E8E\u672C\u90E8\u4EF6 bbox`);
    if (part.polygon) {
      if (!Array.isArray(part.polygon) || part.polygon.length < 3 || part.polygon.length > 256) fail(`${part.name}: polygon \u81F3\u5C11\u9700\u8981 3 \u4E2A\u9876\u70B9`);
      if (part.polygon.some((point) => !isRecord(point) || !finite(point.x) || !finite(point.y) || point.x < 0 || point.y < 0 || point.x > w || point.y > h)) fail(`${part.name}: polygon \u5FC5\u987B\u4F7F\u7528\u6574\u5F20\u6E90\u56FE\u7684\u5750\u6807`);
      const area = part.polygon.reduce((sum, point, i, polygon) => {
        const next = polygon[(i + 1) % polygon.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0);
      if (Math.abs(area) < 1e-10) fail(`${part.name}: polygon \u9762\u79EF\u4E3A\u96F6`);
    } else warnings.push(`${part.name} \u672A\u63D0\u4F9B polygon\uFF0C\u4F7F\u7528\u77E9\u5F62\u533A\u57DF\uFF0C\u8BF7\u68C0\u67E5\u9884\u89C8`);
  }
  const byName = new Map(plan.parts.map((part) => [part.name, part]));
  const done = /* @__PURE__ */ new Set(), active = /* @__PURE__ */ new Set();
  const visit = (part) => {
    if (active.has(part.name)) fail(`\u7236\u5B50\u5173\u7CFB\u6709\u73AF: ${part.name}`);
    if (done.has(part.name)) return;
    active.add(part.name);
    if (part.parent) {
      const parent = byName.get(part.parent);
      if (!parent) fail(`${part.name}: \u7236\u90E8\u4EF6 ${part.parent} \u4E0D\u5B58\u5728`);
      visit(parent);
    }
    active.delete(part.name);
    done.add(part.name);
  };
  plan.parts.forEach(visit);
  const parts = plan.parts.map((part) => {
    const bb = plan.units === "normalized" ? {
      x: part.bbox.x * size.width,
      y: part.bbox.y * size.height,
      width: part.bbox.width * size.width,
      height: part.bbox.height * size.height
    } : { ...part.bbox };
    const pivot = plan.units === "normalized" ? { x: part.pivot.x * bb.width, y: part.pivot.y * bb.height } : { ...part.pivot };
    const polygon = part.polygon?.map((point) => plan.units === "normalized" ? { x: point.x * size.width, y: point.y * size.height } : { ...point });
    return { ...part, bbox: bb, pivot, polygon, occlusion_edges: part.occlusion_edges ?? [] };
  });
  return { plan, parts, warnings };
}
function validateMotion(input, names) {
  if (!isRecord(input)) fail("\u52A8\u4F5C\u65B9\u6848\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  if (input.none === true) return { none: true };
  if (!finite(input.duration) || input.duration <= 0 || input.duration > 30) fail("\u52A8\u4F5C duration \u5FC5\u987B\u5728 0\u201330 \u79D2\u4E4B\u95F4");
  if (!Array.isArray(input.tracks) || input.tracks.length === 0) fail("\u52A8\u4F5C\u65B9\u6848\u5FC5\u987B\u5305\u542B tracks");
  if (input.name !== void 0 && !safePart.test(String(input.name))) fail("\u52A8\u4F5C\u540D\u5E94\u4F7F\u7528\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001_ \u6216 -");
  const seen = /* @__PURE__ */ new Set();
  for (const track of input.tracks) {
    if (!isRecord(track) || !names.has(String(track.part)) || seen.has(String(track.part))) fail(`\u52A8\u4F5C\u90E8\u4EF6\u4E0D\u5B58\u5728\u6216\u91CD\u590D: ${String(track?.part)}`);
    seen.add(String(track.part));
    if (!["translate", "rotate", "scale", "alpha"].some((channel) => track[channel] !== void 0)) fail(`${String(track.part)} \u7F3A\u5C11\u52A8\u4F5C\u901A\u9053`);
    for (const channel of ["translate", "rotate", "scale", "alpha"]) {
      const keys = track[channel];
      if (keys === void 0) continue;
      if (!Array.isArray(keys) || !keys.length) fail(`${String(track.part)}.${channel} \u5FC5\u987B\u662F\u975E\u7A7A\u5173\u952E\u5E27\u6570\u7EC4`);
      let previous = -1;
      for (const key of keys) {
        if (!isRecord(key) || !finite(key.t) || key.t < previous || key.t < 0 || key.t > input.duration) fail(`${String(track.part)}.${channel}: \u65F6\u95F4\u65E0\u6548\u6216\u672A\u6392\u5E8F`);
        previous = key.t;
        const fields = channel === "rotate" ? ["deg"] : channel === "alpha" ? ["a"] : ["x", "y"];
        if (fields.some((field) => !finite(key[field]))) fail(`${String(track.part)}.${channel}: \u7F3A\u5C11 ${fields.join("/")}`);
        if (key.ease !== void 0 && !["linear", "in", "out", "inOut", "back", "step"].includes(String(key.ease))) fail("\u672A\u77E5\u7684 ease");
      }
    }
  }
  return structuredClone(input);
}
async function inspectImage(image) {
  const { data, info } = await sharp7(image).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    ...alphaStats(data, info.width, info.height),
    inferredMatte: inferTransparentMatte(data, info.width, info.height)
  };
}
async function prepare(image, directory, prompt = "", backgroundMode = "auto") {
  if (!["auto", "transparent", "preserve"].includes(backgroundMode)) fail("background \u5FC5\u987B\u662F auto\u3001transparent \u6216 preserve");
  const input = resolve3(image), workdir = resolve3(directory);
  const png = await sharp7(input).rotate().png().toBuffer();
  const meta = await sharp7(png).metadata();
  const transparency = await inspectImage(png);
  if (backgroundMode === "transparent" && !transparency.hasClearBackground) fail("\u6E90\u56FE\u6CA1\u6709\u771F\u5B9E\u900F\u660E\u533A\u57DF\uFF0C\u4E0D\u80FD\u5C06\u767D\u5E95\u6216\u68CB\u76D8\u683C\u5F53\u6210\u900F\u660E PNG");
  await mkdir4(workdir, { recursive: true });
  const source = join6(workdir, "source.png");
  await writeFile2(source, png);
  const request = {
    version: 1,
    imageSize: { width: meta.width, height: meta.height },
    sourceImage: source,
    originalImage: input,
    prompt,
    transparency,
    analysisFile: join6(workdir, "analysis.json"),
    motionFile: join6(workdir, "motion.json"),
    next: "Inspect sourceImage and author analysis.json and motion.json using references/plans.md. Then run build."
  };
  await writeFile2(join6(workdir, "request.json"), JSON.stringify(request, null, 2));
  return request;
}
function assetUrl(root, file) {
  const path = relative(root, file);
  if (path.startsWith(`..${sep}`) || path === "..") fail("\u4EA7\u7269\u8DEF\u5F84\u4E0D\u5728\u8F93\u51FA\u76EE\u5F55\u5185");
  return `/output/${path.split(sep).map(encodeURIComponent).join("/")}`;
}
function animationDuration(value) {
  if (Array.isArray(value)) return Math.max(0, ...value.map((key) => isRecord(key) && finite(key.time) ? key.time : 0));
  if (isRecord(value)) return Math.max(0, ...Object.values(value).map(animationDuration));
  return 0;
}
async function buildAnimation(options) {
  const sourceBuffer = await sharp7(resolve3(options.image)).rotate().png().toBuffer();
  const meta = await sharp7(sourceBuffer).metadata();
  const imageSize = { width: meta.width, height: meta.height };
  const { plan, parts, warnings } = normalizePlan(options.analysis, imageSize);
  const motion = options.motion === void 0 ? void 0 : validateMotion(options.motion, new Set(parts.map((part) => part.name)));
  const targetId = options.target ?? DEFAULT_TARGET;
  if (!Object.hasOwn(EXPORT_TARGETS, targetId)) fail(`\u672A\u77E5\u5BFC\u51FA\u76EE\u6807: ${targetId}`);
  const target = resolveTarget(targetId);
  const density = options.density ?? 8;
  if (!Number.isInteger(density) || density < 3 || density > 24) fail("density \u5FC5\u987B\u662F 3\u201324 \u7684\u6574\u6570");
  const requestedSegmentation = options.segmentation ?? "auto";
  const backend = await segmentationBackend(requestedSegmentation);
  if (backend === "mesh" && motion?.tracks?.some((track) => track.alpha?.length)) fail("\u6574\u56FE\u8499\u76AE\u4E0D\u652F\u6301\u5355\u4E2A\u90E8\u4EF6\u6DE1\u5165\u6DE1\u51FA\uFF0C\u8BF7\u4F7F\u7528 polygon\u3001mobilesam \u6216 sam3");
  const backgroundMode = options.backgroundMode ?? (options.background === false ? "preserve" : "auto");
  const removed = await removeBackground(sourceBuffer, { mode: backgroundMode, matteColor: options.matteColor });
  const processed = removed.buffer ?? sourceBuffer;
  if ((removed.transparency?.after.opaque ?? 0) + (removed.transparency?.after.soft ?? 0) === 0) fail("\u56FE\u7247\u6CA1\u6709\u53EF\u89C1\u4E3B\u4F53");
  if (backend === "mesh" && plan.category === "character" && backgroundMode !== "preserve" && !removed.transparency?.after.hasClearBackground) {
    fail("\u6574\u56FE\u8499\u76AE\u9700\u8981\u771F\u5B9E\u900F\u660E\u80CC\u666F\uFF0C\u8BF7\u5148\u751F\u6210\u900F\u660E PNG \u6216\u5B8C\u6210\u80CC\u666F\u63D0\u53D6");
  }
  const output = resolve3(options.output), project = safeName(options.project);
  const name = safeName(options.name ?? basename2(options.image).replace(/\.[^.]+$/, ""));
  const manifestFile = join6(tempDirOf(output, project, name), "manifest.json");
  const alreadyBuilt = await access2(manifestFile).then(() => true, () => false);
  if (alreadyBuilt && !options.replace) fail(`\u6B64\u9879\u76EE\u5DF2\u6709\u7ED3\u679C\u3002\u8FED\u4EE3\u540C\u4E00\u7D20\u6750\u65F6\u4F7F\u7528 --replace\uFF0C\u6216\u9009\u62E9\u65B0\u7684 --project: ${project}/${name}`);
  const log = options.onLog ?? (() => {
  });
  const workspace = await prepareProjectDir(output, project, { sourceName: name, clean: false });
  const sourceImage = join6(workspace.sourceDir, "source.png");
  const inputImage = join6(workspace.sourceDir, "input.png");
  await writeFile2(inputImage, sourceBuffer);
  await writeFile2(sourceImage, processed);
  const segmented = await segment(sourceImage, parts, requestedSegmentation, backend, log);
  if (segmented.report.note && (segmented.report.samParts.length || segmented.report.note.includes("\u5931\u8D25"))) warnings.push(segmented.report.note);
  if (backgroundMode !== "preserve" && !removed.transparency?.after.meaningfulAlpha) warnings.push("\u8F93\u5165\u4ECD\u4E0D\u900F\u660E\uFF0C\u80CC\u666F\u53EF\u80FD\u6DF7\u5165\u90E8\u4EF6\uFF1B\u8BF7\u4F7F\u7528\u771F\u5B9E\u900F\u660E\u7D20\u6750\u6216\u5148\u5B8C\u6210\u80CC\u666F\u63D0\u53D6");
  if ((removed.transparency?.spillAfter ?? 0) > 100) warnings.push("\u8FB9\u7F18\u4ECD\u6709\u7591\u4F3C\u6B8B\u8272\uFF0C\u8BF7\u5728\u6DF1\u6D45\u80CC\u666F\u4E0B\u5BF9\u7167\u68C0\u67E5");
  log(backend === "mesh" ? "\u6574\u56FE\u8499\u76AE\uFF1A\u4FDD\u7559\u5B8C\u6574\u900F\u660E\u7EB9\u7406\uFF0C\u4E0D\u62C6\u56FE" : `\u5207\u5206 ${parts.length} \u4E2A\u90E8\u4EF6\uFF08${segmented.report.backend}\uFF09`);
  let cuts = [];
  let plate = null;
  if (backend !== "mesh") {
    cuts = await cutImageParts(
      sourceImage,
      parts,
      workspace.imagesDir,
      { margin: 8, bleed: 2, snap: true, halo: plan.category !== "character", samMasks: segmented.masks }
    );
    plate = await buildBasePlate(sourceImage, cuts, workspace.imagesDir, { bleed: 2, onLog: log });
    if (plate) {
      cuts.unshift(plate);
      warnings.push("\u6709\u672A\u88AB\u8F6E\u5ED3\u8986\u76D6\u7684\u50CF\u7D20\u5F52\u5165\u5E95\u677F\uFF0C\u8BF7\u68C0\u67E5\u9884\u89C8");
    }
    segmented.report.samParts = cuts.filter((cut) => cut.contour === "sam").map((cut) => cut.name);
    segmented.report.polygonParts = cuts.filter((cut) => cut.contour !== "sam" && !cut.name.startsWith("_")).map((cut) => cut.name);
  }
  const geometry = { parts: backend === "mesh" ? parts : applyCutGeometry(plate ? [basePlatePart(imageSize.width, imageSize.height), ...parts] : parts, cuts) };
  const skeleton = generateSkeleton(geometry, target.atlasVersion, {
    imageSize,
    density,
    skin: plan.category === "character",
    connectedSkin: backend !== "mesh"
  });
  generateAnimations(skeleton);
  let meshParts;
  if (backend === "mesh") {
    const rootBone = skeleton.bones.find((bone) => !bone.parent);
    const whole = { name: rootBone.name, parent: null, depth: 0, bbox: { x: 0, y: 0, ...imageSize }, pivot: { x: imageSize.width / 2, y: imageSize.height / 2 } };
    skeleton.slots = [{ name: `${whole.name}_slot`, bone: whole.name, attachment: whole.name }];
    skeleton.skins[0].attachments = {};
    meshParts = [whole];
    connectSkin(skeleton, parts, { x: 0, y: 0, ...imageSize }, density, { meshParts });
    skeleton.stats.wholeImage = true;
    const path = join6(workspace.imagesDir, `${whole.name}.png`);
    const raw = await sharp7(processed).ensureAlpha().raw().toBuffer();
    const padded = bleedAlpha(raw, imageSize.width, imageSize.height, 2);
    await sharp7(padded, { raw: { ...imageSize, channels: 4 } }).png().toFile(path);
    cuts = [{ ...whole, path, size: imageSize, contour: "image" }];
  }
  if (motion && !motion.none) {
    const baked = bakeMotion(motion, skeleton, { imageSize, category: plan.category, name: motion.name });
    applyMotion(skeleton, baked);
    warnings.push(...baked.warnings);
  }
  if (options.blink) {
    if (plan.category !== "character") fail("--blink \u53EA\u9002\u7528\u4E8E\u89D2\u8272\u7C7B\u7D20\u6750");
    if (meshParts) {
      const head = parts.find((part) => /head|face|头|脸/i.test(part.name));
      if (!head) fail("\u7728\u773C\u9700\u8981 head \u6216 face \u90E8\u4EF6\u6765\u5B9A\u4F4D\u53CC\u773C");
      const left = Math.floor(head.bbox.x), top = Math.floor(head.bbox.y);
      const box = {
        x: left,
        y: top,
        width: Math.min(imageSize.width - left, Math.ceil(head.bbox.x + head.bbox.width) - left),
        height: Math.min(imageSize.height - top, Math.ceil(head.bbox.y + head.bbox.height) - top)
      };
      const reference = join6(workspace.sourceDir, "eye-reference.png");
      await sharp7(processed).extract({ left, top, width: box.width, height: box.height }).png().toFile(reference);
      const eyes = await detectEyes([{ name: "head", bbox: box, path: reference }]);
      bindBlink(skeleton, parts, imageSize, density, eyes, meshParts);
    } else await addBlink(skeleton, cuts, imageSize, density);
  }
  const alignment = backend === "mesh" ? [] : await diagnoseAlignment(cuts.filter((cut) => !cut.name.startsWith("_")));
  const exportRoot = sourceDirOf(output, project, name);
  log(`\u5BFC\u51FA ${target.label}`);
  const exported = await exportToSpine(skeleton, exportRoot, name, {
    target: targetId,
    cutResults: cuts,
    spineImagesPath: `../../${name}_temp/Image/`,
    skipSpineProject: !options.editable && !options.spineCliPath,
    spineCliPath: options.spineCliPath
  });
  const files = [
    { path: exported.skeletonPath, kind: "json" },
    { path: exported.atlas?.atlasPath, kind: "atlas" },
    { path: join6(dirname2(exported.skeletonPath), `${name}.png`), kind: "texture" },
    { path: sourceImage, kind: "source" }
  ];
  for (const file of files) {
    if (!file.path) fail(`\u7F3A\u5C11\u5BFC\u51FA\u6587\u4EF6: ${file.kind}`);
    await access2(file.path);
  }
  if ((options.editable || options.spineCliPath) && !exported.spineProject?.path) warnings.push(exported.spineProject?.reason ?? "\u672A\u751F\u6210\u53EF\u7F16\u8F91 .spine \u6E90\u5DE5\u7A0B");
  const state = {
    skeleton,
    imageSize,
    category: plan.category,
    analysis: geometry,
    alignment,
    imageUrls: cuts.map((cut) => [cut.name, assetUrl(output, cut.path)]),
    motionParts: summarizeParts(geometry.parts),
    sourceUrl: assetUrl(output, sourceImage)
  };
  const previewFile = join6(workspace.sourceDir, "preview.json");
  const manifest = {
    version: 1,
    id: `${project}/${name}`,
    project,
    name,
    title: options.title ?? name,
    category: plan.category,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    target: { id: target.id, label: target.label, spine: target.spineHeader },
    imageSize,
    sourceUrl: assetUrl(output, sourceImage),
    inputUrl: assetUrl(output, inputImage),
    previewFile: relative(output, previewFile).split(sep).join("/"),
    bones: skeleton.bones.length,
    slots: skeleton.slots.length,
    partCount: parts.length,
    transparency: removed.transparency,
    segmentation: segmented.report,
    animations: Object.entries(skeleton.animations).map(([name2, animation]) => ({ name: name2, duration: animationDuration(animation) })),
    blink: !!skeleton.blink,
    loop: motion?.loop !== false,
    warnings: [...new Set(warnings)],
    files: files.map((file) => ({ name: basename2(file.path), url: assetUrl(output, file.path), kind: file.kind }))
  };
  await writeFile2(join6(workspace.sourceDir, "analysis.plan.json"), JSON.stringify(plan, null, 2));
  if (motion) await writeFile2(join6(workspace.sourceDir, "motion.plan.json"), JSON.stringify(motion, null, 2));
  await writeFile2(previewFile, JSON.stringify(state));
  await writeFile2(manifestFile, JSON.stringify(manifest, null, 2));
  return {
    manifest,
    manifestFile,
    previewFile,
    output,
    exportDirectory: dirname2(exported.skeletonPath),
    files: files.map((file) => file.path),
    editableProject: exported.spineProject?.path ?? null
  };
}
async function readJson(path) {
  return JSON.parse(await readFile(resolve3(path), "utf8"));
}

// agent/preview.ts
import express from "express";
import { access as access3, mkdir as mkdir5, open, readFile as readFile2, readdir as readdir2 } from "node:fs/promises";
import { createServer as createProbe } from "node:net";
import { spawn as spawn2 } from "node:child_process";
import { dirname as dirname3, join as join7, resolve as resolve4, sep as sep2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { tmpdir } from "node:os";
var runtimeRoot = resolve4(dirname3(fileURLToPath2(import.meta.url)), "..");
var service = "spine-animation-preview";
async function listProjects(output) {
  const projects = await readdir2(output, { withFileTypes: true }).catch(() => []);
  const results = await Promise.all(projects.filter((entry) => entry.isDirectory()).map(async (project) => {
    const directory = join7(output, project.name);
    const sources = await readdir2(directory, { withFileTypes: true }).catch(() => []);
    return Promise.all(sources.filter((entry) => entry.isDirectory() && entry.name.endsWith("_temp")).map(async (source) => {
      try {
        const item = JSON.parse(await readFile2(join7(directory, source.name, "manifest.json"), "utf8"));
        if (item.version !== 1 || item.id !== `${project.name}/${source.name.slice(0, -5)}`) return null;
        return item;
      } catch {
        return null;
      }
    }));
  }));
  return results.flat().filter((item) => item !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function available(port) {
  const probe = createProbe();
  return new Promise((done) => {
    probe.once("error", () => done(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => done(true)));
  });
}
async function startPreview(outputDirectory, preferredPort = 3100) {
  if (!Number.isInteger(preferredPort) || preferredPort < 1024 || preferredPort > 65535) throw new Error("\u9884\u89C8\u7AEF\u53E3\u5FC5\u987B\u5728 1024\u201365535 \u4E4B\u95F4");
  const output = resolve4(outputDirectory);
  await mkdir5(output, { recursive: true });
  for (let port = preferredPort; port < preferredPort + 10; port++) {
    if (port < 1024 || port > 65535) throw new Error("\u9884\u89C8\u7AEF\u53E3\u5FC5\u987B\u5728 1024\u201365535 \u4E4B\u95F4");
    const url = `http://127.0.0.1:${port}`;
    try {
      const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(700) }).then((response) => response.json());
      if (health.service === service && health.output === output) return { url, port, reused: true };
    } catch {
    }
    if (!await available(port)) continue;
    const bundled = join7(runtimeRoot, "runtime", "preview-server.mjs");
    const isBundled = await access3(bundled).then(() => true, () => false);
    const entry = isBundled ? [bundled] : [join7(runtimeRoot, "node_modules", "tsx", "dist", "cli.mjs"), join7(runtimeRoot, "agent", "preview-server.ts")];
    const logfile = join7(tmpdir(), `spine-animation-preview-${port}.log`);
    const log = await open(logfile, "a");
    const child = spawn2(process.execPath, [...entry, "--output", output, "--port", String(port)], {
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      cwd: runtimeRoot
    });
    await new Promise((done, reject) => {
      child.once("spawn", done);
      child.once("error", reject);
    });
    child.unref();
    await log.close();
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((done) => setTimeout(done, 100));
      try {
        const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) }).then((response) => response.json());
        if (health.service === service && health.output === output) return { url, port, reused: false, pid: child.pid, logfile };
      } catch {
      }
    }
    throw new Error(`\u9884\u89C8\u670D\u52A1\u542F\u52A8\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B ${logfile}`);
  }
  throw new Error("\u8FDE\u7EED 10 \u4E2A\u9884\u89C8\u7AEF\u53E3\u90FD\u88AB\u5360\u7528\uFF0C\u8BF7\u6307\u5B9A --port");
}

// agent/cli.ts
import sharp8 from "sharp";

// skills/spine-animation/scripts/environment.mjs
import { existsSync as existsSync2, readFileSync, constants as constants2 } from "node:fs";
import { access as access4, mkdir as mkdir6, mkdtemp, rm as rm2, stat as stat3, writeFile as writeFile3 } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname as dirname4, join as join8, resolve as resolve5 } from "node:path";
import { pathToFileURL as pathToFileURL2 } from "node:url";
import { homedir } from "node:os";
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2, parseArgs } from "node:util";
var execute = promisify2(execFile2);
var minimumNode = "20.9.0";
var readPackage = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
var detailOf = (error) => String(error?.stderr?.trim().split("\n").at(-1) || error?.message || error).slice(0, 500);
function supportsNode(version, minimum = minimumNode) {
  const actual = String(version).replace(/^v/, "").split(".").map((part) => parseInt(part, 10));
  const required = minimum.split(".").map(Number);
  if (actual.length < 3 || actual.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) if (actual[i] !== required[i]) return actual[i] > required[i];
  return true;
}
function resolveRuntime(directory) {
  const skill = resolve5(directory);
  const bundled = readPackage(join8(skill, "package.json"))?.name === "spine-animation-skill" || existsSync2(join8(skill, "runtime"));
  const packageRoot = bundled ? skill : resolve5(skill, "../..");
  const manifest = readPackage(join8(packageRoot, "package.json"));
  const canInstall = !!manifest?.dependencies?.sharp && !!manifest?.dependencies?.express;
  const entry = bundled ? [join8(skill, "runtime", "cli.mjs")] : [join8(packageRoot, "node_modules", "tsx", "dist", "cli.mjs"), join8(packageRoot, "agent", "cli.ts")];
  return {
    skill,
    packageRoot,
    kind: bundled ? "bundle" : "source",
    entry,
    canInstall,
    ready: canInstall && entry.every(existsSync2)
  };
}
function packageVersion(entry, name) {
  for (let dir = dirname4(entry), count = 0; count < 8; dir = dirname4(dir), count++) {
    const manifest = readPackage(join8(dir, "package.json"));
    if (manifest?.name === name) return manifest.version;
    if (dir === dirname4(dir)) break;
  }
  return null;
}
async function checkDependency(require2, name, nodeReady) {
  let entry;
  try {
    entry = require2.resolve(name);
  } catch {
    return { available: false, ready: false, error: `${name} \u672A\u5B89\u88C5` };
  }
  const version = packageVersion(entry, name);
  if (!nodeReady) return { available: true, ready: false, version, error: "\u9700\u8981\u5148\u5347\u7EA7 Node.js \u624D\u80FD\u9A8C\u8BC1\u4F9D\u8D56" };
  try {
    const module = require2(name);
    if (name === "sharp") await module({ create: { width: 1, height: 1, channels: 4, background: "#00000000" } }).png().toBuffer();
    if (name === "express" && typeof module().use !== "function") throw new Error("Express \u521D\u59CB\u5316\u5931\u8D25");
    return { available: true, ready: true, version };
  } catch (error) {
    return { available: true, ready: false, version, error: detailOf(error) };
  }
}
async function checkPnpm() {
  try {
    const command2 = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "pnpm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm --version"] : ["--version"];
    const { stdout } = await execute(command2, args, { timeout: 5e3, windowsHide: true });
    const version = stdout.split("\n").map((line) => line.trim()).find((line) => /^\d+\.\d+\.\d+/.test(line));
    return { available: !!version, version: version ?? null };
  } catch (error) {
    return { available: false, version: null, error: detailOf(error) };
  }
}
async function checkSam(packageRoot, backend, verify) {
  const directory = join8(packageRoot, "server", "sam");
  const resources = backend === "mobilesam" ? ["client.mjs", "setup.mjs", "worker.py"] : ["client-sam3.mjs", "setup-sam3.mjs", "worker_sam3.py"];
  if (resources.some((file) => !existsSync2(join8(directory, file)))) {
    return { available: false, filesReady: false, resourcesReady: false, verified: false, error: "skill \u7684\u53EF\u9009 SAM \u8D44\u6E90\u6587\u4EF6\u4E0D\u5B8C\u6574" };
  }
  try {
    const module = await import(pathToFileURL2(join8(directory, backend === "mobilesam" ? "client.mjs" : "client-sam3.mjs")).href);
    const paths = backend === "mobilesam" ? module.paths() : module.sam3Paths();
    const client = backend === "mobilesam" ? new module.SamClient() : new module.Sam3Client();
    const worker = backend === "mobilesam" ? join8(directory, "worker.py") : paths.worker;
    const weightBytes = await stat3(paths.weights).then((file) => file.size, () => 0);
    const filesReady = client.checkEnv() && existsSync2(worker) && weightBytes > 0;
    const status = {
      available: filesReady,
      filesReady,
      resourcesReady: true,
      verified: false,
      home: paths.home,
      python: paths.python,
      weightBytes
    };
    if (!verify || !filesReady) return status;
    const imports = backend === "mobilesam" ? "import numpy, PIL, cv2, timm; sys.path.insert(0, sys.argv[1]); import mobile_sam" : "from transformers import Sam3Model, Sam3Processor";
    const script = `import sys, json, torch
${imports}
print(json.dumps({"python": sys.version.split()[0], "torch": torch.__version__, "device": "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"}))`;
    try {
      const { stdout } = await execute(paths.python, ["-c", script, paths.repo ?? paths.home], {
        timeout: 2e4,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONWARNINGS: "ignore" },
        windowsHide: true
      });
      const info = JSON.parse(stdout.trim().split("\n").at(-1));
      return { ...status, available: true, verified: true, versions: info, verification: "files-and-python-imports" };
    } catch (error) {
      return { ...status, available: false, error: detailOf(error) };
    }
  } catch (error) {
    return { available: false, filesReady: false, resourcesReady: false, verified: false, error: detailOf(error) };
  }
}
async function checkOutput(directory) {
  const path = resolve5(directory);
  let probe;
  try {
    await mkdir6(path, { recursive: true });
    probe = await mkdtemp(join8(path, ".spine-preflight-"));
    await writeFile3(join8(probe, "write-check"), "ok");
    return { ready: true, path };
  } catch (error) {
    return { ready: false, path, error: detailOf(error) };
  } finally {
    if (probe) await rm2(probe, { recursive: true, force: true });
  }
}
async function checkEditor(explicit) {
  const selected = explicit || process.env.SPINE_CLI_PATH;
  const candidates = selected ? [selected] : [
    "/Applications/Spine.app/Contents/MacOS/Spine",
    join8(homedir(), "Applications/Spine.app/Contents/MacOS/Spine"),
    "/opt/spine/Spine",
    "/usr/local/bin/Spine",
    "C:\\Program Files\\Spine\\Spine.com"
  ];
  for (const path of candidates) {
    try {
      await access4(path, constants2.X_OK);
      return { available: true, path, licenseVerified: false };
    } catch {
    }
  }
  return { available: false, path: selected || null, licenseVerified: false };
}
async function checkEnvironment({
  skillDirectory,
  output,
  segmentation = "auto",
  preview = false,
  editable = false,
  spineCliPath
} = {}) {
  if (!skillDirectory) throw new Error("\u7F3A\u5C11 skillDirectory");
  if (!["auto", "mesh", "polygon", "mobilesam", "sam3"].includes(segmentation)) throw new Error("\u672A\u77E5 segmentation");
  const layout = resolveRuntime(skillDirectory);
  const require2 = createRequire(join8(layout.packageRoot, "package.json"));
  const nodeReady = supportsNode(process.versions.node);
  const checks = [];
  const add = (id, ok, required, detail, repair) => checks.push({ id, ok, required, detail, ...repair && !ok ? { repair } : {} });
  const installArgs = [
    "--dir",
    layout.packageRoot,
    ...layout.kind === "bundle" ? ["--ignore-workspace"] : [],
    "install",
    ...layout.kind === "bundle" ? ["--prod"] : [],
    ...existsSync2(join8(layout.packageRoot, "pnpm-lock.yaml")) ? ["--frozen-lockfile"] : []
  ];
  const restoreRuntime = { id: "restore-runtime", message: "\u91CD\u65B0\u89E3\u538B\u5B8C\u6574 skill \u5B89\u88C5\u5305\uFF1B\u6E90\u7801\u5F00\u53D1\u76EE\u5F55\u53EF\u8FD0\u884C pnpm skill:build" };
  const install = layout.canInstall ? {
    id: "install-dependencies",
    command: "pnpm",
    args: installArgs,
    message: `\u5B89\u88C5 ${layout.kind === "bundle" ? "skill \u751F\u4EA7\u4F9D\u8D56" : "\u6E90\u7801\u9879\u76EE\u4F9D\u8D56"}\u540E\u91CD\u65B0\u8FD0\u884C\u81EA\u68C0`
  } : restoreRuntime;
  add(
    "node",
    nodeReady,
    true,
    `Node ${process.version}; \u9700\u8981 >=${minimumNode}`,
    { id: "upgrade-node", message: `\u4F7F\u7528\u5F53\u524D\u73AF\u5883\u7684\u7248\u672C\u7BA1\u7406\u5668\u6216\u5305\u7BA1\u7406\u5668\u51C6\u5907 Node.js >=${minimumNode}\uFF0C\u7136\u540E\u91CD\u8DD1\u81EA\u68C0` }
  );
  const sourceMissingTsx = layout.kind === "source" && !existsSync2(layout.entry[0]) && existsSync2(layout.entry[1]);
  add(
    "runtime",
    layout.ready,
    true,
    layout.ready ? `${layout.kind}: ${layout.entry.at(-1)}` : "\u7F3A\u5C11\u8FD0\u884C\u5165\u53E3\u6216\u6E90\u7801\u6267\u884C\u5668",
    sourceMissingTsx ? install : restoreRuntime
  );
  const dependencies = {};
  for (const name of ["sharp", "express"]) {
    const state = await checkDependency(require2, name, nodeReady);
    dependencies[name] = state;
    add(
      name,
      state.ready,
      true,
      state.ready ? `${name} ${state.version}` : state.error,
      state.available && !nodeReady ? void 0 : install
    );
  }
  const needInstall = layout.canInstall && (sourceMissingTsx || Object.values(dependencies).some((item) => !item.ready && (nodeReady || !item.available)));
  const pnpm = await checkPnpm();
  add(
    "pnpm",
    pnpm.available,
    needInstall,
    pnpm.available ? `pnpm ${pnpm.version}` : "\u672A\u627E\u5230\u53EF\u7528 pnpm\uFF1B\u5DF2\u5B89\u88C5\u4F9D\u8D56\u65F6\u4E0D\u4F1A\u963B\u6B62\u8FD0\u884C",
    { id: "prepare-pnpm", message: "\u4F7F\u7528\u5F53\u524D\u73AF\u5883\u5DF2\u6709\u7684\u5DE5\u5177\u51C6\u5907 pnpm\uFF0C\u518D\u6267\u884C\u4F9D\u8D56\u5B89\u88C5\uFF1B\u4E0D\u8981\u4FEE\u6539\u5176\u4ED6\u9879\u76EE\u7684\u4F9D\u8D56" }
  );
  const [mobilesam, sam3] = await Promise.all([
    checkSam(layout.packageRoot, "mobilesam", segmentation === "mobilesam"),
    checkSam(layout.packageRoot, "sam3", segmentation === "sam3")
  ]);
  const sam = { mobilesam, sam3 };
  for (const [name, state] of Object.entries(sam)) {
    add(
      name,
      state.available,
      segmentation === name,
      state.verified ? `${name} \u7684 Python \u4F9D\u8D56\u5DF2\u9A8C\u8BC1\uFF08${state.versions.device}\uFF09\uFF0C\u6743\u91CD\u5C1A\u672A\u52A0\u8F7D\u63A8\u7406` : state.available ? `${name} \u8D44\u6E90\u6587\u4EF6\u5B58\u5728\uFF1B\u672C\u6B21\u672A\u52A0\u8F7D Python \u68C0\u67E5` : `${name} \u4E0D\u53EF\u7528${state.error ? `: ${state.error}` : "\uFF08\u7F3A\u5C11\u73AF\u5883\u6216\u6A21\u578B\u6587\u4EF6\uFF09"}`,
      state.resourcesReady === false ? { id: `restore-${name}`, message: `\u4ECE\u5B8C\u6574 skill \u5305\u6062\u590D server/sam \u4E2D\u7684 ${name} \u811A\u672C` } : {
        id: `setup-${name}`,
        command: process.execPath,
        args: [join8(layout.skill, "scripts", "spine.mjs"), "sam-setup", "--segmentation", name],
        message: `\u4EC5\u5728\u5F53\u524D\u4EFB\u52A1\u9700\u8981 ${name} \u65F6\u5B89\u88C5\u5176 Python \u73AF\u5883\u548C\u6A21\u578B\uFF0C\u7136\u540E\u590D\u68C0`
      }
    );
  }
  const previewFiles = [
    "web/agent/index.html",
    "web/agent/app.js",
    "web/agent/style.css",
    "web/renderer.js",
    layout.kind === "bundle" ? "runtime/preview-server.mjs" : "agent/preview-server.ts"
  ];
  const missingPreview = previewFiles.filter((file) => !existsSync2(join8(layout.packageRoot, file)));
  add(
    "preview",
    missingPreview.length === 0,
    preview,
    missingPreview.length ? `\u7F3A\u5C11\u9884\u89C8\u8D44\u6E90: ${missingPreview.join(", ")}` : "\u9884\u89C8\u670D\u52A1\u4E0E\u9875\u9762\u8D44\u6E90\u5B58\u5728\uFF1B\u6D4F\u89C8\u5668\u80FD\u529B\u7531 agent \u5BBF\u4E3B\u68C0\u67E5",
    { id: "restore-preview", message: "\u6062\u590D\u5B8C\u6574 skill \u5305\u4E2D\u7684 web \u548C\u9884\u89C8\u670D\u52A1\u6587\u4EF6\uFF0C\u518D\u91CD\u65B0\u81EA\u68C0" }
  );
  const editor = await checkEditor(spineCliPath);
  add(
    "spine-editor",
    editor.available,
    editable || !!spineCliPath,
    editor.available ? `\u68C0\u6D4B\u5230 ${editor.path}\uFF0C\u672A\u68C0\u67E5\u8BB8\u53EF\u8BC1\u72B6\u6001` : "\u6CA1\u6709\u627E\u5230 Spine \u7F16\u8F91\u5668\uFF08\u666E\u901A JSON/atlas/PNG \u5BFC\u51FA\u4E0D\u9700\u8981\uFF09",
    { id: "configure-spine", message: "\u53EF\u7F16\u8F91 .spine \u9700\u8981\u5DF2\u6388\u6743\u7684 Spine \u7F16\u8F91\u5668\uFF1B\u63D0\u4F9B\u6709\u6548 --spine-cli \u8DEF\u5F84\u6216 SPINE_CLI_PATH" }
  );
  const outputState = output ? await checkOutput(output) : null;
  if (outputState) add(
    "output",
    outputState.ready,
    true,
    outputState.ready ? `\u53EF\u5199: ${outputState.path}` : outputState.error,
    { id: "fix-output", message: `\u4FEE\u590D\u8F93\u51FA\u76EE\u5F55\u7684\u53EF\u5199\u6027\u6216\u786E\u8BA4\u6B63\u786E\u76EE\u5F55: ${outputState.path}` }
  );
  const priority = { "upgrade-node": 0, "prepare-pnpm": 1, "restore-runtime": 2, "install-dependencies": 3 };
  const repairs = [...new Map(checks.filter((item) => item.required && !item.ok && item.repair).map((item) => [item.repair.id, item.repair])).values()].sort((a, b) => (priority[a.id] ?? 10) - (priority[b.id] ?? 10));
  const baseReady = checks.filter((item) => ["node", "runtime", "sharp", "express"].includes(item.id)).every((item) => item.ok);
  return {
    ready: checks.every((item) => !item.required || item.ok),
    node: process.version,
    requiredNode: `>=${minimumNode}`,
    sharp: dependencies.sharp.version ?? null,
    runtime: layout.packageRoot,
    runtimeMode: layout.kind,
    modelApiRequired: false,
    segmentation,
    dependencies,
    pnpm,
    sam,
    editor,
    output: outputState,
    capabilities: {
      mesh: baseReady,
      polygon: baseReady,
      mobilesam: baseReady && mobilesam.available,
      sam3: baseReady && sam3.available,
      preview: baseReady && !missingPreview.length,
      editable: baseReady && editor.available
    },
    checks,
    repairs
  };
}

// agent/cli.ts
console.log = (...values) => console.error(...values);
var [command = "help", ...argv] = process.argv.slice(2);
var help = {
  name: "spine-animation",
  commands: {
    doctor: "[--output DIR] [--segmentation MODE] [--preview] [--editable]: check required dependencies and return repair commands before building.",
    inspect: "--image FILE: inspect actual alpha and a possible colored matte.",
    prepare: "--image FILE --workdir DIR [--prompt TEXT] [--background transparent]: normalize and inspect the planning image.",
    validate: "--image FILE --analysis FILE [--motion FILE]: validate the agent-authored plans without writing artifacts.",
    build: "--image FILE --analysis FILE --project NAME [--motion FILE] [--segmentation auto|polygon|mobilesam|sam3|mesh] [--background auto|transparent|preserve] [--matte-color #RRGGBB] [--blink] [--preview] [--replace] [--editable]",
    "sam-setup": "--segmentation mobilesam|sam3: explicitly install an optional local Python/model environment.",
    preview: "[--output DIR] [--port 3100] [--id PROJECT/ASSET]: start/reuse the persistent local demo page.",
    list: "[--output DIR]: list completed animation manifests."
  },
  coordinates: "analysis.units is normalized or pixels. bbox/polygon use the whole image; pivot is relative to the part bbox."
};
async function main() {
  const { values } = parseArgs2({ args: argv, options: {
    image: { type: "string" },
    workdir: { type: "string" },
    prompt: { type: "string" },
    analysis: { type: "string" },
    motion: { type: "string" },
    project: { type: "string" },
    name: { type: "string" },
    output: { type: "string" },
    target: { type: "string" },
    density: { type: "string" },
    port: { type: "string", default: "3100" },
    id: { type: "string" },
    blink: { type: "boolean" },
    preview: { type: "boolean" },
    replace: { type: "boolean" },
    "keep-background": { type: "boolean" },
    help: { type: "boolean", short: "h" },
    editable: { type: "boolean" },
    "spine-cli": { type: "string" },
    segmentation: { type: "string", default: "auto" },
    background: { type: "string", default: "auto" },
    "matte-color": { type: "string" },
    title: { type: "string" }
  } });
  const required = (key) => {
    const value = values[key];
    if (typeof value !== "string" || !value) throw new Error(`\u7F3A\u5C11 --${key}`);
    return value;
  };
  const output = resolve6(values.output ?? "output");
  if (values.help || ["help", "--help", "-h"].includes(command)) return help;
  if (command === "doctor") {
    const result = await checkEnvironment({
      skillDirectory: existsSync3(join9(runtimeRoot, "SKILL.md")) ? runtimeRoot : join9(runtimeRoot, "skills", "spine-animation"),
      output: values.output,
      segmentation: values.segmentation,
      preview: values.preview,
      editable: values.editable,
      spineCliPath: values["spine-cli"]
    });
    if (!result.ready) process.exitCode = 1;
    return result;
  }
  if (command === "inspect") return inspectImage(resolve6(required("image")));
  if (command === "sam-setup") return setupSam(values.segmentation);
  if (command === "prepare") return prepare(required("image"), values.workdir ?? resolve6("output", "plans", basename3(required("image"))), values.prompt, values.background);
  if (command === "list") return { projects: await listProjects(output) };
  if (command === "preview") {
    const viewer = await startPreview(output, Number(values.port));
    return { ...viewer, url: values.id ? `${viewer.url}/?project=${encodeURIComponent(values.id)}` : viewer.url, output };
  }
  if (command === "validate" || command === "build") {
    const image = resolve6(required("image"));
    const analysis = await readJson(required("analysis"));
    const motion = values.motion ? await readJson(values.motion) : void 0;
    if (command === "validate") {
      const meta = await sharp8(image).rotate().png().toBuffer().then((buffer) => sharp8(buffer).metadata());
      const validated = normalizePlan(analysis, { width: meta.width, height: meta.height });
      if (motion !== void 0) validateMotion(motion, new Set(validated.parts.map((part) => part.name)));
      return { valid: true, parts: validated.parts.length, category: validated.plan.category, warnings: validated.warnings };
    }
    const result = await buildAnimation({
      image,
      analysis,
      motion,
      output,
      project: required("project"),
      name: values.name,
      target: values.target,
      density: values.density ? Number(values.density) : void 0,
      blink: values.blink,
      background: !values["keep-background"],
      replace: values.replace,
      editable: values.editable,
      spineCliPath: values["spine-cli"],
      segmentation: values.segmentation,
      backgroundMode: values["keep-background"] ? "preserve" : values.background,
      matteColor: values["matte-color"],
      title: values.title,
      onLog: (message) => console.error(`[spine] ${message}`)
    });
    const viewer = values.preview ? await startPreview(output, Number(values.port)) : void 0;
    return { ...result, ...viewer ? { previewUrl: `${viewer.url}/?project=${encodeURIComponent(result.manifest.id)}` } : {} };
  }
  throw new Error(`\u672A\u77E5\u547D\u4EE4: ${command}`);
}
try {
  const result = await main();
  process.stdout.write(JSON.stringify({ ok: command !== "doctor" || result.ready !== false, result }, null, 2) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2) + "\n");
  process.exitCode = 1;
}
