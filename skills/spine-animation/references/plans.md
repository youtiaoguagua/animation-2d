# Agent-authored plans

`prepare` returns an oriented PNG and its dimensions. Inspect that PNG before
choosing boundaries and pivots. Plans are UTF-8 JSON files, with no code fences.

## Parts: analysis.json

```json
{
  "units": "normalized",
  "category": "character",
  "imageSize": { "width": 400, "height": 500 },
  "parts": [
    {
      "name": "body",
      "parent": null,
      "depth": 0,
      "bbox": { "x": 0.3, "y": 0.44, "width": 0.4, "height": 0.5 },
      "pivot": { "x": 0.5, "y": 0.5 },
      "polygon": [{ "x": 0.3, "y": 0.44 }, { "x": 0.7, "y": 0.44 }, { "x": 0.7, "y": 0.94 }, { "x": 0.3, "y": 0.94 }]
    },
    {
      "name": "head",
      "parent": "body",
      "depth": 1,
      "bbox": { "x": 0.25, "y": 0.08, "width": 0.5, "height": 0.4 },
      "pivot": { "x": 0.5, "y": 0.95 },
      "polygon": [{ "x": 0.5, "y": 0.08 }, { "x": 0.75, "y": 0.22 }, { "x": 0.65, "y": 0.48 }, { "x": 0.35, "y": 0.48 }, { "x": 0.25, "y": 0.22 }]
    }
  ]
}
```

The example illustrates the format; estimate actual geometry from the user's
image. Bboxes and polygon points refer to the whole image. A pivot refers to its
own bbox. With `normalized`, all coordinates are proportions from 0 to 1. With
`pixels`, bboxes/polygons use source pixels and pivots use local bbox pixels.
`imageSize` is optional, but if present must match the source exactly.

Names are unique English identifiers beginning with a letter. Parent links must
refer to existing parts and contain no cycles. Depth is a nonnegative integer;
lower values draw first. Categories: `character`, `prop`, `effect`, `item`, `ui`.

Use polygons to describe the visible shape, usually 8–16 points for a complex
piece. Bboxes may overlap; include the estimated hidden extent when needed.
`occlusion_edges` can list `top`, `bottom`, `left`, `right` for later artwork work.
Without a polygon, a rectangular fallback is used and reported as a warning.
Keep a recognizable `head` or `face` part for the optional blink detector.
With `--segmentation mesh`, these parts describe bone regions rather than cut
textures; the original RGBA remains one texture. The same hierarchy and pivot
coordinates apply. Use separate-layer modes for per-part alpha or occlusion.

## Motion: motion.json

```json
{
  "name": "idle",
  "duration": 2,
  "loop": true,
  "tracks": [
    {
      "part": "head",
      "rotate": [
        { "t": 0, "deg": 0, "ease": "inOut" },
        { "t": 0.5, "deg": 3, "ease": "inOut" },
        { "t": 1, "deg": 0, "ease": "inOut" },
        { "t": 1.5, "deg": -3, "ease": "inOut" },
        { "t": 2, "deg": 0 }
      ]
    }
  ]
}
```

Each part appears at most once in `tracks`. Channels:

| Channel | Values | Meaning |
| --- | --- | --- |
| `rotate` | `deg` | Clockwise degrees relative to rest |
| `translate` | `x`, `y` | Pixel offsets; right/down are positive |
| `scale` | `x`, `y` | Multipliers; rest is 1,1 |
| `alpha` | `a` | Opacity from 0 to 1; children need their own alpha track |

Keys use seconds in `t`, are ordered, and stay within `duration` (up to 30 seconds).
`ease` affects the interval starting at the key: `linear`, `in`, `out`, `inOut`,
`back`, `step`. The runtime bakes easing into ordinary linear keyframes.

For looping motion, make the first/last values match. Parent movement is inherited.
Characters restrict child translation/scale and clamp child rotations to ±10°;
put whole-character translations or scales on the topmost actual part. `idle` as
the explicit name replaces the default breathing idle; another name preserves it.
For larger actions, assess the completed artwork and rig using
[artwork-completion.md](artwork-completion.md) first. Inspect baked warnings and
rendered key poses; raising requested angles or bypassing category limits alone
does not validate that a punch or other action is achievable.
Use `--blink` for synchronized eye deformation rather than inventing eye parts
that are absent from the source. Blink detection supports clear, dark frontal eyes
and fails explicitly when it cannot locate a pair.

## Results

`build` prints JSON with `ok`, `result.manifest`, `result.files`,
`result.exportDirectory`, and, when requested, `result.previewUrl`.
The manifest is published after the build completes. The viewer can list all
completed jobs in an output root. Planning files and preview state stay beside
the intermediate images; engine-ready assets are in the separate export folder.
