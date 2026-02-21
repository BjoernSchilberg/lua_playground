import fs from "fs";
import path from "path";
import FolderPage from "./FolderPage";

/**
 * Scan public/ at build time to find folders that contain a manifest.json.
 * Each such folder becomes a statically pre-rendered route.
 */
export function generateStaticParams() {
  const publicDir = path.join(process.cwd(), "public");
  return fs
    .readdirSync(publicDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        fs.existsSync(path.join(publicDir, d.name, "manifest.json")),
    )
    .map((d) => ({ folder: d.name }));
}

export default function Page() {
  return <FolderPage />;
}
