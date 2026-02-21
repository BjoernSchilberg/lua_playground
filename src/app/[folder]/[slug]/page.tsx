import fs from "fs";
import path from "path";
import FolderPage from "../FolderPage";

/**
 * Generate all slug sub-routes for each folder that has a manifest.json.
 * E.g. /tutorial/einfuehrung-lua05_01
 */
export function generateStaticParams() {
  const publicDir = path.join(process.cwd(), "public");
  const folders = fs
    .readdirSync(publicDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        fs.existsSync(path.join(publicDir, d.name, "manifest.json")),
    );

  const params: { folder: string; slug: string }[] = [];

  for (const d of folders) {
    try {
      const manifestPath = path.join(publicDir, d.name, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      for (const entry of manifest) {
        if (entry.slug) {
          params.push({ folder: d.name, slug: entry.slug });
        }
      }
    } catch {
      // Skip if manifest can't be read
    }
  }

  return params;
}

export default function Page() {
  return <FolderPage />;
}
