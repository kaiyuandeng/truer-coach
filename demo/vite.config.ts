import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Builds demo/dist/index.html: the whole app plus its API (the worker on in-browser SQLite) in one file.
// npm run build:demo

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Small source rewrites so app code that assumes a real server works inside the demo page. */
function demoPatches(): Plugin {
  const patches: [RegExp, string, string][] = [
    [/src\/api\.ts$/, `export const mediaUrl = (key: string) => "/api/media/" + key;`, `export const mediaUrl = (key: string) => (globalThis as any).__demoMediaUrl(key);`],
    [/patient\/Account\.tsx$/, `location.href = "/";`, `(globalThis as any).__demoHome();`],
    [/src\/App\.tsx$/, `let firstMe: Promise<Me> | null = api.get<Me>("/me");`, `let firstMe: Promise<Me> | null = null;`],
  ];
  return {
    name: "demo-patches",
    enforce: "pre",
    transform(code, id) {
      for (const [file, from, to] of patches) {
        if (!file.test(id)) continue;
        if (!code.includes(from)) this.error(`demo patch no longer matches ${id}: ${from}`);
        return code.replace(from, to);
      }
    },
  };
}

/** SQLite's wasm binary as a base64 string, so it ships inside the page. */
function sqlWasm(): Plugin {
  const id = "virtual:sql-wasm";
  return {
    name: "sql-wasm",
    resolveId: (s) => (s === id ? "\0" + id : undefined),
    load: (s) =>
      s === "\0" + id
        ? `export default ${JSON.stringify(readFileSync(here("../node_modules/sql.js/dist/sql-wasm.wasm")).toString("base64"))};`
        : undefined,
  };
}

/** Inlines the built JS and CSS into index.html so the demo is a single file. */
function singleFile(): Plugin {
  return {
    name: "single-file",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName.endsWith(".html"));
      if (!html || html.type !== "asset") return;
      let src = String(html.source);
      for (const [name, f] of Object.entries(bundle)) {
        if (f.type === "chunk" && name.endsWith(".js")) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*></script>`);
          // With code splitting off nothing gets preloaded, but Vite still leaves its placeholder behind.
          const code = f.code.replaceAll("__VITE_PRELOAD__", "void 0").replace(/<\/script/g, "<\\/script");
          src = src.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (f.type === "asset" && name.endsWith(".css")) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*>`);
          src = src.replace(tag, () => `<style>${String(f.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = src;
    },
  };
}

export default defineConfig({
  root: here("."),
  base: "./",
  plugins: [demoPatches(), sqlWasm(), react(), singleFile()],
  resolve: { alias: { "hono/cookie": here("./cookie.ts") } },
  build: {
    outDir: here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
