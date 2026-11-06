---
name: spine-animation
description: "Create Spine skeletal animations from images with agent-authored part and motion plans, export JSON/atlas/PNG for game engines, and open a local animation demo page. Use for character animation, image rigging, blinking, or UI motion in Spine."
---

# Spine Animation

Use your own image understanding to plan the parts and motion. The bundled local
runtime rigs a transparent whole image or cuts parts, adds keyframes, exports assets, and serves a
preview. This workflow does not call a separate model API or need an API key.

## Environment preflight — run first

Resolve this skill's directory from its `SKILL.md` location. Run its launcher with
absolute paths; it also works when your current directory is another project:

```bash
node --version
node /absolute/path/to/spine-animation/scripts/spine.mjs doctor \
  --segmentation mesh --output /absolute/path/output --preview
```

Before `prepare`, `validate`, `build`, or starting a preview:

1. Confirm Node.js 20.9+. If `node` is missing or older, prepare a compatible Node
   using the environment's available package/version manager before launching the
   skill. The skill bundles compiled JavaScript, not the Node executable.
2. Run `doctor` with the user's actual output directory. Use `mesh` for the initial
   basic check if the strategy is not yet known. Pass `--preview` when a demo is
   requested; add `--editable`/`--spine-cli` only when editable `.spine` is needed.
   Recheck with `--segmentation mobilesam` or `sam3` before explicitly using that
   backend; these checks also verify its Python imports, without loading weights
   for inference. Missing optional models do not block mesh/polygon workflows.
3. Read `result.ready`, `checks[].required`, and `repairs`. Within the user's
   existing authorization, repair only missing requirements for the current task,
   then rerun the same check. `repairs` provides commands as `command` plus `args`;
   preserve paths as arguments. Installed-package dependency repair uses pnpm in
   the skill directory; the source checkout uses its own dependency installation.
   Start each generation command only after its own required checks pass;
   independent planning/preparation may continue while blockers are resolved.
   Do not silently replace a requested backend or final format. If a repair is
   blocked by network/access or fails, report the specific blocker instead of
   repeatedly reinstalling or claiming readiness. Do not install SAM 3 merely
   because it is listed as an unavailable optional capability.

The bootstrap doctor uses Node built-ins and can report missing/broken
Sharp/Express before the application imports them. It checks the runtime files,
native image encoding, package manager, requested output writability, and optional
features. It does not install packages or models. pnpm is needed to repair missing
dependencies; an already-installed runtime can run without pnpm on PATH.

Preview-resource readiness does not prove the agent has browser/computer tools.
Check the host's available tools when automatic page opening or screenshots are
requested, and report visual verification separately. Keep the user's chosen
output directory; the default is `./output` in the current working directory.
stdout is JSON, progress goes to stderr, and failed required checks exit nonzero.

## Create an animation

1. Identify the source image, requested motion, export target, and output folder
   from the conversation. Default to Cocos Creator 3.8 (`cocos-3.8`) if no target is
   specified. Reuse provided images and assets. When only a character description
   is provided, use an available image-generation tool if the user has requested
   creation of the artwork; otherwise obtain a source image.
2. Run `prepare` to get the correctly oriented image and exact dimensions:

   ```bash
   node /absolute/path/to/spine-animation/scripts/spine.mjs prepare \
     --image /absolute/path/character.png --workdir /absolute/path/plans/character \
     --prompt "2-second idle, small head and arm swings, blinking"
   ```

3. Inspect the returned `sourceImage` with your image-viewing capability. Read
   [references/plans.md](references/plans.md) for coordinate and keyframe formats.
   Write `analysis.json` and `motion.json` yourself. Do not ask the user to author
   these files. Split only pieces that need separate motion or visual layering.
   For a character's small idle motions, prefer `--segmentation mesh`: one
   transparent texture is driven by multiple bones, without cutting the image.
   Use `auto`/`mobilesam`/`sam3`/`polygon` when separate layers are needed. For dirty
   edges, SAM requests, or new transparent artwork, read
   [references/cutouts.md](references/cutouts.md) before choosing a path.
4. Validate and build a review candidate. Read
   [references/human-review.md](references/human-review.md) before the first build
   so the candidate includes the evidence needed for human quality review:

   ```bash
   node /absolute/path/to/spine-animation/scripts/spine.mjs validate \
     --image /absolute/path/plans/character/source.png \
     --analysis /absolute/path/plans/character/analysis.json \
     --motion /absolute/path/plans/character/motion.json

   node /absolute/path/to/spine-animation/scripts/spine.mjs build \
     --image /absolute/path/plans/character/source.png \
     --analysis /absolute/path/plans/character/analysis.json \
     --motion /absolute/path/plans/character/motion.json \
     --project character-idle --output /absolute/path/output \
     --target cocos-3.8 --segmentation mesh --background transparent --blink --preview
   ```

   Add `--blink` only when blinking is requested and the character has clear,
   front-facing dark eyes. Omit `--motion` to use the default idle. Use `--name`
   for a stable asset name. When iterating a previously generated job, use
   `--replace`; other projects and sources remain separate.
5. Open the returned `previewUrl` using the available browser, if possible. Check
   the original image against the animation at rest and at the largest movement,
   and inspect a closed-eye frame when blinking was requested. Adjust the plans
   and rebuild when a concrete defect is visible. Complete the human checkpoints
   below before calling the result accepted. Preserve requested open pages.

## Human quality checkpoints

Use three checkpoints during animation production:

| Checkpoint | Human reviews |
| --- | --- |
| Materials and rig | Actual cleaned source, cut parts or whole-image texture, rest pose, and joints |
| Motion | Playable animation, extreme poses, loop seam, and closed/reopened eyes when requested |
| Delivery | The reviewed revision's target format, actual files, and any unresolved limitations |

Wait for explicit human approval before advancing past a quality checkpoint.
Draft builds and exports are allowed to produce review evidence. First fix
defects the agent can identify, then show the actual images/preview and ask for
targeted feedback. A successful build or the agent's own visual check does not
constitute human approval.

Follow [references/human-review.md](references/human-review.md) for checklists,
review records, and changes that require another review. Present checkpoints
together when their evidence is ready, and reuse explicit approval of unchanged
artifacts. Honor a user's explicit instruction to skip or relax a checkpoint;
record that checkpoint as waived rather than approved.

## Quality and deliverables

- Use English part identifiers. `parent` describes motion inheritance; `depth`
  describes draw order. Keep a limb with its held object when they move together.
- For an image with no hidden-region reconstruction, favor small rotations and
  coherent movement. Characters use a shared deformation mesh to keep joints
  connected. Large independent poses can require separate, completed artwork;
  changing the motion JSON cannot reveal details absent from the source image.
- A transparent whole image still needs bone regions and pivots. Whole-image
  meshes support coherent deformations; per-part opacity and independently
  changing occlusion require separate layers. Do not promise unseen artwork.
- `build` never downloads SAM/Python environments or calls image-generation APIs.
  `doctor` reports optional local MobileSAM/SAM 3 availability. `auto` uses an
  installed backend and reports actual polygon fallbacks; explicit SAM modes fail
  when unavailable. Use `sam-setup` only as part of requested SAM work when the
  local model installation fits the user's scope and resource constraints.
- For newly requested artwork, prefer a generator's real transparent-background
  option, then verify alpha with `inspect` or `prepare --background transparent`.
  A checkerboard painted into RGB is not transparency. Avoid green-screen
  backgrounds for new assets. Existing RGBA can still have matte-colored edges;
  the build inspects alpha and conservatively repairs identifiable color spill.
- Inspect the build's `warnings`. Do not claim that a skipped blink or unavailable
  editable project was produced. Standard deliverables are same-named `.json`,
  `.atlas`, and `.png`; an editable `.spine` file additionally needs an installed
  Spine editor and `--editable` (or `--spine-cli /path/to/editor`). Report that
  limitation when applicable.
- Return the preview link, artifact folder or files, animations, and what was
  verified, including human review status. Pending or rejected work remains a
  review candidate. Inspect edges against both light and dark preview
  backgrounds. If no browser is available, report visual verification as
  incomplete and let the human inspect the available preview or images.

The preview service persists after the command exits. To reopen or refresh a job:

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs preview \
  --output /absolute/path/output --id character-idle/character
```

Targets: `cocos-3.8`, `unity`, `spine-4.0`, `spine-4.1`, `spine-4.2`, `layaair`,
`phaser`, and `pixijs`. Runtime versions and mesh animation encoding are selected
by the target; do not change an exported JSON's version string by hand.
