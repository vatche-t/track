import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replace bare % (invalid URL percent-encoding) inside /@fs/ paths.
// Needed because this project lives at a Windows path containing %, e.g.
// D:\%BkUP_DntRmvMe!\... — browsers reject %Bk as malformed percent-encoding.
// We encode % → %25 in outgoing content; Vite's own /@fs/ handler calls
// decodeURIComponent, so %25 correctly round-trips back to % on disk.
function fixFsUrls(str) {
  return str.replace(/\/@fs\/[^\s"'`<>()[\]{}\\]+/g, (m) =>
    m.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"),
  );
}

function fixWindowsPercentPathPlugin() {
  return {
    name: "fix-windows-percent-path",
    // Fix /@fs/ URLs inside the served index.html
    transformIndexHtml: { order: "post", handler: fixFsUrls },
    // Fix /@fs/ URLs inside transformed JS/TS source modules
    transform(code) {
      if (code.includes("/@fs/") && /%[^0-9A-Fa-f]/.test(code)) {
        return { code: fixFsUrls(code), map: null };
      }
    },
    configureServer(server) {
      // Fix /@vite/* virtual modules (e.g. @vite/client which imports env.mjs)
      // These bypass the transform hook so we intercept at the response level.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/@vite/")) return next();
        const chunks = [];
        const orig = { write: res.write.bind(res), end: res.end.bind(res) };
        res.write = (chunk, enc, cb) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          if (typeof enc === "function") enc();
          else if (typeof cb === "function") cb();
          return true;
        };
        res.end = (chunk, enc, cb) => {
          if (typeof enc === "function") { cb = enc; enc = undefined; }
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          if (!res.getHeader("content-encoding")) {
            const fixed = Buffer.from(fixFsUrls(Buffer.concat(chunks).toString("utf8")));
            res.setHeader("content-length", fixed.length);
            return orig.end(fixed, cb);
          }
          return orig.end(Buffer.concat(chunks), cb);
        };
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fixWindowsPercentPathPlugin()],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  resolve: {
    preserveSymlinks: true,
  },
});
