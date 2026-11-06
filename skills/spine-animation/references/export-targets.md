# Choose the export target

The target selects the exported Spine data format and its intended engine/runtime.
Unity (`unity`) is the default recommendation. When the user has not already
specified a target, ask them to choose before the first build/export, including
drafts for quality review. Use the host's question UI when available; present
Unity first, Cocos Creator 3.8 next, and the remaining targets as alternatives.
Record the actual selection before continuing. A preselected option, timeout, or
no reply does not count as accepting the default.

Reuse a target explicitly chosen in the request or earlier in the conversation.
An explicit instruction to use the default selects Unity. Ask again when the
user changes the intended engine/runtime, rather than repeating an unchanged
choice during each quality checkpoint.

## Available profiles

These versions describe this project's export profiles, not the latest versions
of external runtimes:

| Target ID | Intended use | Exported Spine version |
| --- | --- | --- |
| `unity` | Unity with spine-unity; default recommendation | 4.2.10 |
| `cocos-3.8` | Cocos Creator 3.8 profile | 3.8.75 |
| `spine-4.0` | Spine 4.0 data | 4.0.64 |
| `spine-4.1` | Spine 4.1 data | 4.1.23 |
| `spine-4.2` | Spine 4.2 data | 4.2.10 |
| `layaair` | LayaAir profile | 3.8.75 |
| `phaser` | Phaser with spine-phaser 4.2 | 4.2.10 |
| `pixijs` | PixiJS with spine-pixi 4.2 | 4.2.10 |

The Unity profile requires a matching spine-unity 4.2 runtime; the Unity editor
version alone does not establish Spine compatibility. Clarify a specifically
requested runtime version if it does not match the available profile. Do not
change only the exported JSON version string to claim compatibility.

## Build and review

Always pass the chosen target explicitly, even when Unity was selected:

```bash
node /absolute/path/to/spine-animation/scripts/spine.mjs build \
  --image /path/source.png --analysis /path/analysis.json --motion /path/motion.json \
  --project character-idle --target unity --segmentation mesh --background transparent --preview
```

Save the target ID, runtime version, and user's selection in the planning
workdir's `quality-review.json`. At delivery, compare the choice with
`manifest.target` and the actual exported skeleton version. A runtime fallback
does not replace the skill's human selection step.
