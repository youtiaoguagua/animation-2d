# Image size and file budget

Apply this policy to animation source artwork, completed layers, and pose
variants. Documentation screenshots and explicitly requested large backgrounds
have their own display requirements.

## Defaults

| Asset | Normal budget |
| --- | --- |
| Working source or full-canvas pose | Longest edge 512 px; PNG at most 524288 bytes (512 KiB) |
| Simple small icon/UI element | Prefer 128–256 px when it preserves the requested detail |
| Detailed character close-up | Up to 1024 px when justified by the intended display/detail |
| Exported atlas for one normal character | Aim for a longest edge at most 1024 px and PNG at most 1 MiB |

Use the user's explicitly requested size when present. A larger budget needs an
actual resolution/detail requirement and a recorded reason. Avoid selecting
2K/4K/8K merely because a generator offers it. If the generator's smallest
available output exceeds the working budget, create a smaller working copy
before sending it for analysis or authoring geometry.

## Prepare before planning

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs prepare \
  --image /path/original.png --workdir /path/plans/character \
  --max-edge 512 --max-bytes 524288
```

`prepare` preserves the original, applies orientation, keeps aspect ratio and
alpha, and never enlarges a small image. It uses lossless PNG compression; when
that is insufficient, it reduces the working dimensions further. It stops with
an actionable error when the byte budget cannot be met at a useful minimum
working size. It does not quantize colors or replace transparency with JPEG.
When reliable colored-matte evidence exists, the existing conservative edge
cleanup runs on the original-resolution working buffer before reduction, so
resampling does not spread the old matte into new edge pixels. The original
file remains intact. `--background preserve` retains the cleanup opt-out.

Use `result.sourceImage` and `result.imageSize`, not the original dimensions.
`result.imageBudget` records original/working dimensions and bytes, scale ratios,
configured limits, and whether bytes forced additional reduction. The same
information is saved in `request.json` and should be recorded in the planning
workdir's `quality-review.json`.

For an explicitly justified larger image, pass both limits, for example
`--max-edge 1024 --max-bytes 1048576`. Raising these flags is a deliberate task
decision, not an automatic retry after poor artwork or an oversized generation.

## Coordinate and alignment rules

- Prepare the final working canvas before `analysis.json` and `motion.json`.
  Existing plans for a different size block `prepare` from overwriting that job;
  use a new workdir and replan, or explicitly retain the existing size budget.
- Pixel bboxes, polygon points, local pivots, and motion translations all depend
  on the working dimensions. Normalized geometry still needs matching
  `imageSize`; motion translations remain pixel values. Reauthor or correctly
  rescale all affected values when changing resolution.
- Keep completed layers and pose variants on the same canvas transform. If the
  byte budget reduces one pose further, normalize the entire aligned group to
  the same final canvas before integrating it. Do not fit each part independently.
- Inspect actual eyes, fingers, outlines, and transparency after reduction.
  Resolve lost detail by choosing an appropriate documented budget or improving
  the artwork, then repeat the affected quality checks.

## Check final output

Measure the actual atlas PNG, not just the working source or ZIP size. Atlas
padding and layout can increase dimensions; compressed file size also differs
from decoded texture memory. If a normal single-character atlas exceeds its
budget, reduce/clean the source or improve packing, then rebuild with consistent
plans. Confirm atlas references, rest pose, maximum movement, and blinking again.

Texture resolution and in-game display/world size are separate settings. Preserve
the user's intended display size through the target engine's import scale.
Keep image-budget checks as agent self-checks, separate from human approval.
