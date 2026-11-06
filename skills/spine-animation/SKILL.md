---
name: spine-animation
description: "Create Spine skeletal animations from images with agent-authored part and motion plans, export JSON/atlas/PNG for game engines, and open a local animation demo page. Use for character animation, image rigging, blinking, or UI motion in Spine."
---

# Spine Animation

Use your own image understanding to plan the parts and motion. The bundled local
runtime rigs a transparent whole image or cuts parts, adds keyframes, exports assets, and serves a
preview. The local runtime does not call a separate model API or need an API key.
Artwork completion, when required, uses the host's image-generation/editing tools.

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
2. Run `doctor` with the user's actual output directory. Use `mesh` for the
   initial dependency check; this does not select the animation's rig strategy.
   Add `--preview` unless the user explicitly skips the workbench. Add
   `--editable`/`--spine-cli` only when editable `.spine` is needed.
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
The installed skill serves prebuilt static web assets; React/Vite are needed
only when developing or rebuilding the frontend from source.
Check the host's available tools when automatic page opening or screenshots are
requested, and report visual verification separately. Keep the user's chosen
output directory; the default is `./output` in the current working directory.
stdout is JSON, progress goes to stderr, and failed required checks exit nonzero.

## Open the workbench at task start

For each animation-making request, start or reuse the workbench as soon as the
basic preflight passes, before target-selection questions, artwork generation,
planning, or model setup. Use the user's output folder (otherwise `./output` in
the calling workdir). An empty output folder is supported:

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs preview \
  --output /absolute/path/output
```

Immediately send the actual returned `result.url` as a clickable link. In Codex
desktop, use an available `open_in_codex` tool to open it in the current chat's
right panel. See [references/workbench-start.md](references/workbench-start.md)
for the tool arguments, tab reuse, and fallbacks. Opening the workbench does not
need a completed animation or a chosen export target.

Keep the service and page available during production and human review. After
each completed build, navigate/refresh the existing workbench to the returned
`previewUrl`, or tell the user to select the new project and click refresh when
the host cannot automate that. Honor an explicit request to skip the webpage.

## Create an animation

1. With the workbench link already provided, identify the source image,
   requested motion, export target, and output folder
   from the conversation. If the user has not chosen an export target, offer
   Unity (`unity`) as the default/recommended option, Cocos Creator 3.8, and the
   other supported targets. Wait for the user's selection before any build or
   export; a preselected default or silence is not a choice. Reuse an existing
   explicit choice, including an instruction to use the default, without asking
   again. See [references/export-targets.md](references/export-targets.md) for
   options and version compatibility. Independent environment checks, image
   preparation, and planning can continue while waiting. Reuse provided images
   and assets. When only a character description is provided, use an available
   image-generation tool if the user has requested creation of the artwork;
   otherwise obtain a source image.
2. Apply [references/image-size.md](references/image-size.md) before generating
   or preparing artwork. Default to a 512 px longest edge and a 512 KiB working
   PNG. Request the smallest suitable generation size, then use `prepare` to
   enforce the actual pixel/byte budget without changing the original:

   ```bash
   node /absolute/path/to/spine-animation/scripts/spine.mjs prepare \
     --image /absolute/path/character.png --workdir /absolute/path/plans/character \
     --max-edge 512 --max-bytes 524288 \
     --prompt "2-second idle, small head and arm swings, blinking"
   ```

3. Inspect the returned `sourceImage` with your image-viewing capability. Read
   [references/plans.md](references/plans.md) for coordinate and keyframe formats.
   Use the returned `imageSize` as the coordinate base; record `imageBudget`.
   Confirm eyes, fingers, and thin outlines remain readable after reduction.
   Define the action's key poses and joints that move independently, then choose
   the rig using [references/artwork-completion.md](references/artwork-completion.md).
   Whole-image `mesh` is suitable for small, coherent idle motion supported by
   the existing pixels. For articulated limb motion, large joint rotations, or
   changing overlap, use separate cut/completed layers with joint overlap and
   hidden regions filled. Use alternate attachments/poses when hand, face, or
   perspective changes need different artwork; combine these methods as needed.
   Do not reuse an idle whole-image rig for a punch, walk, or dance merely to
   avoid seams, or reduce the requested action to fit that rig.
   Record the choice and required moving parts as `rigDecision` in
   `quality-review.json`. Check that the active build path can consume the assets
   and perform the required poses before investing in keyframes. Complete and
   inspect missing artwork when supported; resolve a missing capability or
   revised scope with the user before continuing dependent production.
   Write `analysis.json` and `motion.json` yourself. Do not ask the user to author
   these files. Split at joints that need relative motion and boundaries needed
   for visual layering; avoid unnecessary cuts in fixed regions. Use
   `auto`/`mobilesam`/`sam3`/`polygon` to cut an existing source. `auto` selects an
   installed mask backend, not a rig strategy. For dirty edges, SAM requests, or
   new transparent artwork, read
   [references/cutouts.md](references/cutouts.md) before choosing a path.
4. Validate and build a review candidate. Read
   [references/human-review.md](references/human-review.md) before the first build
   so the candidate includes the evidence needed for human quality review.
   The example below cuts parts with `polygon`; use the backend chosen for the
   actual task. Use `mesh` for a whole-image strategy, or a tested layer/pose
   integration path when standard `build` cannot perform the required poses:

   ```bash
   node /absolute/path/to/spine-animation/scripts/spine.mjs validate \
     --image /absolute/path/plans/character/source.png \
     --analysis /absolute/path/plans/character/analysis.json \
     --motion /absolute/path/plans/character/motion.json

   node /absolute/path/to/spine-animation/scripts/spine.mjs build \
     --image /absolute/path/plans/character/source.png \
     --analysis /absolute/path/plans/character/analysis.json \
     --motion /absolute/path/plans/character/motion.json \
     --project character-motion --output /absolute/path/output \
     --target unity --segmentation polygon --background transparent --blink --preview
   ```

   Always pass the user's selected ID with `--target`; the example above assumes
   Unity was chosen. Add `--blink` only when blinking is requested and the
   character has clear, front-facing dark eyes. Omit `--motion` to use the default
   idle. Use `--name`
   for a stable asset name. When iterating a previously generated job, use
   `--replace`; other projects and sources remain separate.
5. Update the already-open workbench to the returned `previewUrl`, reusing its
   tab where supported. Check
   the original image against the animation at rest and at the largest movement,
   and inspect a closed-eye frame when blinking was requested. Adjust the plans
   and rebuild when a concrete defect is visible. Also check the requested
   action against its key poses: a punch needs a readable strike and recovery,
   with a suitable hand shape and body mechanics. Record image/action self-checks
   separately from file validation. Complete the human checkpoints
   below before calling the result accepted. Preserve requested open pages.

## Human quality checkpoints

Use three checkpoints during animation production:

| Checkpoint | Human reviews |
| --- | --- |
| Materials and rig | Rig strategy, actual cut/completed parts or whole-image texture, joint overlap, rest/extreme poses |
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
- Match the rig to the requested action. Keep articulated joints connected
  through suitable pivots, overlapping complete artwork, and tuned weights.
  Use local mesh deformation within separate layers when useful; verify that
  moving limbs actually articulate independently. Missing artwork or the
  standard build's motion limits require a compatible artwork/integration path
  or an agreed scope change, rather than a smaller substitute gesture.
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
- Keep normal working images within 512 px / 512 KiB. Use a larger budget only
  for an explicit user size requirement or a concrete detail need; record the
  reason. Check final atlas dimensions/bytes, and rebuild from budgeted source
  when oversized rather than resizing an exported texture on its own.
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

Targets: `unity` (default recommendation), `cocos-3.8`, `spine-4.0`, `spine-4.1`,
`spine-4.2`, `layaair`, `phaser`, and `pixijs`. Runtime versions and mesh animation
encoding are selected by the target; do not change an exported JSON's version
string by hand.
