// agent/preview-server.ts
import { parseArgs as parseArgs2 } from "node:util";
import { resolve as resolve3 } from "node:path";

// agent/preview.ts
import express from "express";
import { access, mkdir, open, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname as dirname2, join as join2, resolve as resolve2, sep as sep2 } from "node:path";
import { fileURLToPath } from "node:url";

// skills/spine-animation/scripts/environment.mjs
import { existsSync, readFileSync, constants } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
var execute = promisify(execFile);
function previewAssets(packageRoot) {
  const web = join(packageRoot, "web");
  const compiled = [web, join(web, "dist")].find((directory) => existsSync(join(directory, "index.html")));
  if (!compiled) return { directory: join(web, "agent"), layout: "legacy", files: [
    join(web, "agent/index.html"),
    join(web, "agent/app.js"),
    join(web, "agent/style.css"),
    join(web, "renderer.js")
  ] };
  const files = /* @__PURE__ */ new Set([join(compiled, "index.html"), join(compiled, "renderer.js")]);
  let html = "";
  try {
    html = readFileSync(join(compiled, "index.html"), "utf8");
  } catch {
  }
  for (const [, reference] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    const pathname = reference.split(/[?#]/)[0];
    const file = resolve(compiled, pathname.startsWith("/") ? "." + pathname : pathname);
    if (file.startsWith(compiled + sep)) files.add(file);
  }
  return { directory: compiled, layout: "studio", files: [...files] };
}

// agent/preview.ts
var runtimeRoot = resolve2(dirname2(fileURLToPath(import.meta.url)), "..");
var service = "spine-animation-preview";
async function listProjects(output2) {
  const projects = await readdir(output2, { withFileTypes: true }).catch(() => []);
  const results = await Promise.all(projects.filter((entry) => entry.isDirectory()).map(async (project) => {
    const directory = join2(output2, project.name);
    const sources = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return Promise.all(sources.filter((entry) => entry.isDirectory() && entry.name.endsWith("_temp")).map(async (source) => {
      try {
        const item = JSON.parse(await readFile(join2(directory, source.name, "manifest.json"), "utf8"));
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
  const output2 = resolve2(outputDirectory), app = express();
  const web = previewAssets(runtimeRoot);
  app.get("/api/health", (_req, res) => res.json({
    status: "ok",
    service,
    output: output2,
    web: resolve2(web.directory).slice(runtimeRoot.length + 1),
    viewer: web.layout
  }));
  app.get("/api/projects", async (_req, res) => {
    res.set("Cache-Control", "no-store").json({ projects: await listProjects(output2) });
  });
  app.get("/api/project", async (req, res) => {
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const manifest = (await listProjects(output2)).find((project) => project.id === id);
    if (!manifest) return res.status(404).json({ error: "\u6CA1\u6709\u627E\u5230\u8FD9\u4E2A\u52A8\u753B\u9879\u76EE" });
    const file = resolve2(output2, manifest.previewFile);
    if (!file.startsWith(output2 + sep2)) return res.status(400).json({ error: "\u9884\u89C8\u8DEF\u5F84\u65E0\u6548" });
    try {
      const preview = JSON.parse(await readFile(file, "utf8"));
      return res.set("Cache-Control", "no-store").json({ manifest, preview });
    } catch {
      return res.status(409).json({ error: "\u9884\u89C8\u6570\u636E\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0" });
    }
  });
  app.use("/output", express.static(output2, { etag: false, maxAge: 0, dotfiles: "deny" }));
  app.get("/renderer.js", (_req, res) => res.sendFile(web.layout === "studio" ? join2(web.directory, "renderer.js") : join2(runtimeRoot, "web", "renderer.js")));
  app.use(express.static(web.directory, { etag: false, maxAge: 0 }));
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
var { values } = parseArgs2({ options: { output: { type: "string" }, port: { type: "string", default: "3100" } } });
var output = resolve3(values.output ?? "output");
var server = await listenPreview(output, Number(values.port));
process.stdout.write(JSON.stringify({ service: "spine-animation-preview", output, address: server.address() }) + "\n");
