# Transparent artwork, edge cleanup, and SAM

Transparency of the whole character and separation of its parts are different
problems. A clean RGBA source avoids background extraction. A whole-image mesh
also avoids cutting that source into separate textures, while still using the
agent's bone-region plan for movement.

| Path | Use it for | Limits |
| --- | --- | --- |
| Real transparent source + `mesh` | Idle, breathing, blinking, small limb/head motion | One continuous texture; no independent layer opacity or newly revealed hidden artwork |
| `mobilesam` | Pixel masks from part bounding boxes | Can select a neighboring object when boxes overlap; check actual fallbacks |
| `sam3` | Text-prompted fine or ambiguous parts | Larger local model; absent objects/missed parts can fall back to other masks/polygons |
| `polygon` | Lightweight deterministic builds without local model dependencies | Depends on the quality of the agent's outlines |

## Inspect before changing an existing image

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs inspect --image /path/source.png
node /absolute/path/to/spine-animation/scripts/spine.mjs doctor
```

`meaningfulAlpha` means the pixels actually use transparency, rather than merely
having an alpha channel. `hasClearBackground` additionally checks for empty
transparent pixels. `inferredMatte` identifies a strongly colored matte stored
under transparent pixels when there is reliable evidence for one.

Background modes:

- `--background auto`: preserve existing alpha, remove a detectable solid opaque
  background, and repair identifiable matte spill along the edge.
- `--background transparent`: require an actually empty alpha background; keep
  its shape and apply the same conservative edge cleanup. Reject opaque white or
  painted checkerboard results rather than calling them transparent.
- `--background preserve` / `--keep-background`: preserve the source colors and
  alpha exactly; useful for intentionally opaque panels/scenes.
- `--matte-color '#00ff00'`: provide a known original matte when automatic
  inference has insufficient evidence. Do not guess from legitimate green
  clothing. The cleaner treats a narrow edge band and protects interior colors.

Check `manifest.transparency`: before/after alpha, corrected edge pixels, and
suspected color-spill counts. Counts are diagnostics, not a general image quality
score. Transparent pixels with RGB spill and partially transparent contaminated
pixels both need inspection. Do not erase the character's real colors globally.

## Choosing SAM

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs sam-setup --segmentation mobilesam
node /absolute/path/to/spine-animation/scripts/spine.mjs build ... --segmentation mobilesam
```

For SAM 3, use `sam-setup --segmentation sam3`, then `build --segmentation sam3`.
These are optional machine-level Python/model installations under
`~/.spine-tool/mobilesam` and `~/.spine-tool/sam3`. MobileSAM uses compatible
Python 3.9–3.13 (preferring 3.11); the setup can use uv and honors the locked
requirements. SAM 3 requires a larger separate environment. Do not install both
models merely to build an animation. Reuse existing installations.

`auto` prefers available MobileSAM, then SAM 3, then polygons. An explicitly named
missing backend produces an error and setup guidance. Inference failures in
`auto` are reported before polygon fallback. `manifest.segmentation` records the
actual mask-backed and polygon-backed parts. SAM masks locate geometry; they do
not reconstruct occluded pixels or guarantee removal of matte-colored RGB.

## Requesting new transparent artwork

Use the host's available image-generation/editing capability. Set its actual
transparent output option (for example `transparent_background: true` when that
is the provided tool's parameter), not only a phrase in the prompt. Do not add a
new model API dependency to this local runtime for that purpose.

For new character art, request a complete character with a clear silhouette,
readable joints, and minimal self-occlusion when consistent with the user's pose.
For background/edge cleanup of an existing character, preserve identity, pose,
proportions, colors, clothing, and composition; change only background/edge
contamination. For action-specific completion or new poses, follow
[artwork-completion.md](artwork-completion.md). Request RGBA, no
painted white/checkerboard/green background, no background-colored rim, and
natural soft edge alpha. Verify the returned file using `inspect` before calling
the transparency requirement satisfied.

For whole-image rigging:

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs build \
  --image /path/transparent.png --analysis /path/analysis.json --motion /path/motion.json \
  --project transparent-idle --segmentation mesh --background transparent --blink --preview
```

For large independent joint rotations or changing occlusion, prefer aligned,
complete transparent layers with hidden regions filled by an appropriate artwork
workflow. A single generated transparent image removes the background problem;
it cannot supply the back of a hand or torso that was never visible. Follow
[artwork-completion.md](artwork-completion.md) to identify missing assets, check
integration support, complete the artwork, and inspect the requested action.
The standalone skill does not bundle the original editor's inpainting workflow.
