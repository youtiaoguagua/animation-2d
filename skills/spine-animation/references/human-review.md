# Human quality review

Apply these checkpoints to animation production. Prepare a concrete candidate,
complete the agent's own checks, and fix visible defects before requesting human
review. The existing `build` command generates preview and export files together;
these files are drafts until the applicable human checkpoints pass.

## Materials and rig

Use the workbench opened at task start for review; show the candidate in the
same tab instead of delaying the first workbench link until this checkpoint.

Review the first candidate before accepting its materials/rig or producing more
animation variants. Show the original beside the actual processed source on
light and dark backgrounds. For separate layers, also show the actual cut parts;
for a whole-image mesh, show the whole texture and a rest pose with bones visible.
Explain the intended motion and any reconstructed hidden regions briefly.

Ask the human to check:

- Character identity, proportions, colors, and all intended parts are preserved.
- Hair, fingers, clothing, and thin outlines remain intact; edges have no visible
  background residue, colored fringe, accidental holes, or duplicate fragments.
- The working/final texture dimensions and bytes fit the recorded image budget;
  size reduction preserves readable eyes, fingers, and outlines at the intended
  display size. Any larger-budget exception has a concrete reason.
- The rest pose matches the original; shoulders, neck, elbows, and wrists connect
  cleanly, pivots are plausible, and foreground/background order is correct.

Use `manifest.inputUrl`, `manifest.sourceUrl`, and the existing preview's bone
display. Actual cut textures are available through `preview.imageUrls`.
Do not describe nonexistent cut layers for mesh mode. New artwork, reconstructed
parts, or changed source cleanup belongs in this review. Include the completed
assets and their rest/extreme-pose evidence from
[artwork-completion.md](artwork-completion.md), so the
human can see identity, new anatomy, alignment, and hidden-region repairs.

## Motion

Review the playable candidate before accepting its motion. Show its preview and
useful stills/contact sheets: rest, greatest movement, and an open/closed/reopened
eye sequence when blinking is requested. Inspect against light and dark
backgrounds, and play at least two complete cycles for looping animations.

Ask the human to check:

- Action, timing, amplitude, and personality match the request.
- The defining poses read as the requested action. For a punch, inspect the hand
  shape, anticipation, strike, shoulder/torso contribution, and recovery; inspect
  perspective when required. A reach/arm raise remains a failed punch candidate.
- Joints stay connected, limbs and held objects move together, and the texture
  avoids visible tears, unwanted stretching, sliding, or incorrect overlap.
- Looping motion returns smoothly to its start without a snap or sudden pause.
- Both eyes close and reopen naturally, without deforming the face or mistaking
  eyebrows, glasses, or mouth for eyes. A skipped blink cannot pass a blink task.

If the agent cannot operate a browser, provide the working preview URL and
available image files for the human to inspect. Record the agent's visual check
as incomplete. Do not invent screenshots or claim playback was observed.

## Delivery

Confirm that the export target was chosen by the user and matches
`manifest.target`. If a choice is still missing, return to the target-selection
step; a technical default does not count as human selection.

Present the exact candidate revision and actual downloadable files before
claiming final acceptance. Show the target/runtime version, animation names and
duration, JSON/atlas/PNG paths, and relevant warnings. Check that files exist,
atlas texture names resolve, and the exported data contains the requested motion.

Ask the human whether this reviewed revision and export set are acceptable.
Report whether import/playback in the actual target engine was tested. When the
user requested target-engine import acceptance, obtain that evidence or leave
that item pending; a local web preview alone does not prove an engine import.
An editable `.spine` file is included only when actually generated successfully.

Motion and delivery can share one review when the final export is already
available and corresponds to the displayed animation. Materials can be included
in the same request when their evidence is ready. State which checkpoints the
combined question covers, so one explicit human answer can cover them all.

## Feedback, revisions, and approval

At a checkpoint, provide the images/preview first, name the checkpoint and
candidate revision, and ask what should change or whether it passes. Explain
that this skill requires human quality review and link the applicable rule in
`SKILL.md`. Stop dependent production work while waiting; environment checks,
file validation, and preparing review evidence may continue independently.

Keep `quality-review.json` in the planning workdir, outside generated directories
that a rebuild may replace. This is an agent-maintained review record, not a CLI
option or a runtime-enforced approval. Record:

- Candidate revision and the source, plans, preview, and export files it covers;
  retain review stills or file hashes so a replaced preview cannot stand for an
  earlier revision.
- Selected export target/runtime and the user's explicit choice or acceptance
  of Unity as the default.
- Original/working image dimensions and bytes, final atlas dimensions and bytes,
  scale ratios, and any reason for exceeding the default image budget.
- Each checkpoint's status: `pending`, `approved`, `changes_requested`, or
  `waived`, plus the human's actual feedback and the evidence shown.
- Changes made in response and any approvals invalidated by those changes.
- Image/action self-check evidence and failures under `agentChecks`, kept
  separate from human approval. Export validation alone cannot pass an action.

Only actual human feedback can set `approved`. Silence, elapsed time, a tool
success, or an agent/subagent review cannot do so. Reuse earlier explicit
approval for unchanged material and scope instead of asking the same question
again. An explicit user instruction to skip or relax a checkpoint takes
precedence; record its scope as `waived` and disclose it with the result.

After requested changes, fix the candidate, update its evidence/revision, and
resubmit the affected checkpoints:

| Change | Review again |
| --- | --- |
| Source, cleanup, cut masks, pivots, hierarchy, weights, or draw order | Materials/rig, motion, and delivery |
| Keyframes, timing, loop, or blink | Motion and delivery |
| Export target/runtime, texture layout, or delivery files | Delivery; also motion when rendered appearance changes |
| Description-only edit with unchanged artifacts | Reuse the recorded approvals |

Do not ask for approval of every command, every frame, or each automatic repair.
Keep pending/rejected work labeled as a candidate. Final acceptance requires
each applicable checkpoint to be approved or explicitly waived; report remaining
limitations and unverified items accurately.
