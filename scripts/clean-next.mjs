/**
 * Removes `.next` before `npm run dev` so webpack dev chunks (e.g. page.js)
 * are not mixed with leftover `next build` output (page-<hash>.js), which
 * causes ChunkLoadError / 404 on route chunks.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".next");
if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true });
  console.info("[clean-next] Removed .next for a consistent dev server.");
}
