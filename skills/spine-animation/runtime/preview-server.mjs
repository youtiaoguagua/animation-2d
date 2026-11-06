// agent/preview-server.ts
import { parseArgs } from "node:util";
import { resolve as resolve2 } from "node:path";

// agent/preview.ts
import express from "express";
import { access, mkdir, open, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
var runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
var service = "spine-animation-preview";
async function listProjects(output2) {
  const projects = await readdir(output2, { withFileTypes: true }).catch(() => []);
  const results = await Promise.all(projects.filter((entry) => entry.isDirectory()).map(async (project) => {
    const directory = join(output2, project.name);
    const sources = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return Promise.all(sources.filter((entry) => entry.isDirectory() && entry.name.endsWith("_temp")).map(async (source) => {
      try {
        const item = JSON.parse(await readFile(join(directory, source.name, "manifest.json"), "utf8"));
        if (item.version !== 1 || item.id !== `${project.name}/${source.name.slice(0, -5)}`) return null;
        return item;
      } catch {
        return null;
      }
    }));
  }));
  return results.flat().filter((item) => item !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function createPreviewApp(outputDirectory) {
  const output2 = resolve(outputDirectory), app = express();
  app.get("/api/health", (_req, res) => res.json({ status: "ok", service, output: output2 }));
  app.get("/api/projects", async (_req, res) => {
    res.set("Cache-Control", "no-store").json({ projects: await listProjects(output2) });
  });
  app.get("/api/project", async (req, res) => {
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const manifest = (await listProjects(output2)).find((project) => project.id === id);
    if (!manifest) return res.status(404).json({ error: "\u6CA1\u6709\u627E\u5230\u8FD9\u4E2A\u52A8\u753B\u9879\u76EE" });
    const file = resolve(output2, manifest.previewFile);
    if (!file.startsWith(output2 + sep)) return res.status(400).json({ error: "\u9884\u89C8\u8DEF\u5F84\u65E0\u6548" });
    try {
      const preview = JSON.parse(await readFile(file, "utf8"));
      return res.set("Cache-Control", "no-store").json({ manifest, preview });
    } catch {
      return res.status(409).json({ error: "\u9884\u89C8\u6570\u636E\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0" });
    }
  });
  app.use("/output", express.static(output2, { etag: false, maxAge: 0, dotfiles: "deny" }));
  app.get("/renderer.js", (_req, res) => res.sendFile(join(runtimeRoot, "web", "renderer.js")));
  app.use(express.static(join(runtimeRoot, "web", "agent"), { etag: false, maxAge: 0 }));
  return app;
}
async function listenPreview(output2, port) {
  const server2 = createServer(createPreviewApp(output2));
  await new Promise((done, reject) => {
    server2.once("error", reject);
    server2.listen(port, "127.0.0.1", () => {
      server2.off("error", reject);
      done();
    });
  });
  return server2;
}

// agent/preview-server.ts
var { values } = parseArgs({ options: { output: { type: "string" }, port: { type: "string", default: "3100" } } });
var output = resolve2(values.output ?? "output");
var server = await listenPreview(output, Number(values.port));
process.stdout.write(JSON.stringify({ service: "spine-animation-preview", output, address: server.address() }) + "\n");
