# Artwork completion and action self-checks

Choose a rig from the requested action's key poses before selecting a cutting
backend. Extend the artwork workflow below when those poses need shapes or pixels
the source does not contain. A front-facing standing character can support a
punch, but the required artwork and perspective depend on the intended strike.

## Choose the rig and assess the source

Identify the action's defining poses and write a short list of visible features
needed in each. Resolve material ambiguity, such as punching toward the camera
or sideways, using the request/reference or a concise user question. Combine it
with export-target selection when both choices are missing.

| Requested change | Rig and artwork decision |
| --- | --- |
| Small idle, breathing, simple blinking | Whole-image mesh may suffice when the existing silhouette and visible pixels support every pose |
| Independent arm/leg joints, as in articulated walking or dancing | Use layered or hybrid rigs; separate the required moving joints and complete limb shapes, joint overlap, and exposed body pixels |
| Fist, grip, or changed expression | Add the actual hand/face shape as a layer or alternate attachment when the source cannot deform into it plausibly |
| Camera-facing strike or turn | Supply foreshortened limbs, changed silhouettes, and newly visible surfaces as suitable layers or pose variants |
| Changing foreground/background order | Use complete layers on both sides of the occlusion and a verified draw-order or attachment-switching path |

Honor an explicitly requested rig or stylized motion, and explain any resulting
pose limits. Reuse complete artwork already provided by the user.

A hybrid rig can keep a torso mesh while separate limbs articulate and hands or
faces switch artwork. Cut at joints whose relative angles must change; extra
cuts in fixed regions are unnecessary. Check that a shared body texture no
longer contains the old moving limb beneath its replacement. Fill the exposed
torso and retain overlapping joint art for the full movement range.

Transparency does not decide the rig: clean RGBA still needs separation when
parts must move independently. The `auto` segmentation option only chooses an
available mask backend; it does not assess the action or perform rig selection.
Use polygon cutting without SAM when suitable; missing optional models are not
a reason to replace an articulated action with whole-image stretching.

Reuse artwork that already supplies the required features. Record missing
pieces, key poses, and the chosen method in the planning workdir's
`quality-review.json`. Include `rigDecision` with `method` (`whole-image`,
`layered`, `hybrid`, or `pose-variants`), the reason, required moving parts/joints,
missing artwork, and the actual integration command or adapter path. These are
review-record fields, not new CLI flags or runtime-enforced checks. Preserve the
source and save completed candidates separately. A clean mask, a filled bounding
box, or moving an existing texture does not establish that new artwork exists.

## Complete and integrate the artwork

Apply [image-size.md](image-size.md): default to a 512 px working canvas and
512 KiB per PNG, and keep aligned layers/poses at one common scale. Reduce
oversized tool output before geometry planning and repeat the visual checks.

Use an available image-generation/editing tool for semantic completion, such as
a fist, bent-arm pose, or newly exposed torso. Preserve character identity,
style, proportions, clothing, and palette while changing what the action needs.
Request actual RGBA output for transparent assets and verify its alpha. SAM
provides masks; it does not paint missing anatomy or pose variants.

Keep layers/key poses on a consistent canvas with known placement and anchors.
Node/Sharp, TypeScript, or Python with uv can handle alignment, cropping,
compositing, and checks after artwork creation. Retain intended joint overlap
and sufficient hidden pixels for the largest movement.

Check integration capability before investing in the animation:

- The current standard `build` accepts one source image and part/motion plans.
  It does not automatically inpaint, ingest arbitrary replacement layers, or
  create attachment-switching timelines from a set of key-pose images.
- Character child motion is limited to small rotations; child translation and
  scale are restricted. Check actual baked motion and warnings. Large requested
  angles do not establish that the output performs them.
- For completed layers or alternate poses, use tooling that actually supports
  those inputs, or implement a job-local adapter and validate its preview and
  export. Merely creating image files without wiring them into the animation is
  incomplete. Check the APIs/files actually present in the installed environment.
  Keep custom processing in the job workdir; Node/TypeScript with Sharp or Python
  with uv are suitable choices. Verify layer placement, hierarchy, pivots,
  weights, required attachment/draw-order timelines, and the selected target's
  export encoding. Do not invent a `--layers` or pose-import option for `build`.
- Removing character limits alone cannot supply missing art or establish a
  working action rig. Verify joints, occlusion, and extreme poses in the chosen
  path before relying on a wider motion range.

If artwork tools or a compatible integration path are unavailable, report the
specific missing capability. Obtain the missing assets or the user's agreement
to a revised action; keep the original action unresolved until then. A static
strike image alone does not satisfy a requested animated strike and recovery.

## Image self-checks

Inspect each completed image before rigging and again in rendered key poses:

- **Technical:** the file decodes, its size/placement matches the plan, required
  layers are aligned, and transparent artwork contains real empty alpha. Use
  `inspect` for alpha/matte diagnostics and view edges on light and dark backgrounds.
- **Visual:** identity and style match, anatomy and silhouettes are plausible,
  thin features are intact, and hidden-region fills look coherent. Check for
  extra/missing fingers or limbs, duplicated fragments, holes, residual old
  poses, colored fringe, and visibly stretched/copied patches.
- **Integration:** inspect rest and maximum-movement poses. Verify that the
  completed artwork is actually visible in the relevant frames, joints remain
  connected, and overlap order changes as intended. Show the actual required
  limb textures and their pivots; effect layers or a high slot count alone do
  not establish that the character has been separated at its moving joints.

Fix visible failures and inspect the revised images before continuing. Alpha
statistics and an error-free file validator support these checks; the agent must
also look at the actual artwork. Mark a visual check unverified when the required
viewing capability or evidence is unavailable.

## Action self-checks

Compare the actual rendered action with the brief at its defining moments and
at playback speed. Define criteria for the requested action, not only for
whether the file loads. For a punch, inspect:

- A readable preparation/guard, anticipation, strike, and recoil/recovery when
  those phases belong in the requested style and timing.
- A style-appropriate fist/hand shape, elbow extension, shoulder contribution,
  and suitable torso/weight movement. Check that the result reads as striking.
- Foreshortening, fist scale, and occlusion for a camera-facing strike; body
  orientation and silhouette for a sideways strike, when required by the brief.
- A clear difference between anticipation, impact, and recovery timing, with a
  smooth loop only when looping was requested.

For other actions, derive equivalent visible criteria from their brief. If the
result is only an arm raise, reach, or idle variation, record the requested punch
as failed and revise the artwork, rig, or motion. Do not silently relabel it as a
completed punch because export validation passed.

For articulated actions, compare the required joints' relative poses across the
animation. Confirm that the relevant limbs bend or rotate independently, the
body does not merely stretch as one block, and required hand/pose variants
actually appear. A bobbing body, moving prop, or added effects cannot establish
that the requested walking, dancing, or striking mechanics were produced.

Record technical-image, visual-image, and action checks separately under
`agentChecks` in `quality-review.json`, with evidence and `passed`, `failed`, or
`unverified` status. Update affected checks after revisions. These are agent
self-checks; the human checkpoints in [human-review.md](human-review.md) still
require actual human feedback before they can be marked approved.
