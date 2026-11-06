# Open the workbench before production

The first visible result of an animation-making task is its working preview
address. Resolve the output folder and pass the basic mesh/preview preflight,
then run `preview --output ABSOLUTE_OUTPUT`. The service can start with no image,
plans, or completed jobs. Give the actual URL immediately, while continuing the
remaining task. Repair missing basic requirements and retry within the task's
authorization; report a concrete blocker if startup fails. Never invent a port
or send a known-dead URL.

## Codex right panel

Discover the host's available tool named `open_in_codex` (its namespace can vary).
When present, use this argument shape with the returned workbench URL:

```json
{
  "placement": "right",
  "target": {
    "type": "browser",
    "url": "ACTUAL_WORKBENCH_URL"
  }
}
```

Omit `threadId` so the panel opens beside the current chat. Record a returned
browser tab ID when available and reuse it for later results. If the host reports
`queued`, say that opening was requested/queued, while keeping the URL visible;
do not claim the page is already displayed or visually verified.

## Other hosts and later updates

When the Codex panel tool is unavailable, provide the clickable URL and use an
available browser opener when appropriate for the user's host/preferences.
Automatic opening is optional; getting the workbench URL to the user is part of
startup. Browser access is independent of the local preview service.

Keep the same output directory for `preview` and `build`. Reuse the service for
that directory rather than starting another for every step. If the user changes
the output folder, start/reuse its matching viewer and provide the new address.

After a successful build, use its actual `previewUrl` to show the new revision
in the existing browser tab where the host supports navigation. If the current
page remains on an older result, refresh it or select the project. When browser
automation is unavailable, explain the refresh/project-selection action briefly.
Keep the page and service open while waiting for human quality feedback.
