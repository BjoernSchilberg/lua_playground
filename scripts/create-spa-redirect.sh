#!/usr/bin/env bash
# Post-build: fix GitHub Pages routing for Next.js static export.
#
# 1. For each <dir>/  that has a matching <dir>.html at the same level,
#    copy <dir>.html → <dir>/index.html  (so /test/ serves test/index.html).
# 2. Same for nested slug dirs: <dir>/<slug>.html → <dir>/<slug>/index.html
# 3. Create a generic 404.html SPA redirect that preserves the URL path.

set -e

OUT_DIR="${1:-out}"
BASE_PATH="${2:-}"

# ---- Step 1: Create index.html inside each folder/slug directory ----
# Find all *.html files in out/ (up to 3 levels) that have a matching directory
find "$OUT_DIR" -maxdepth 3 -name "*.html" -not -name "index.html" -not -name "404.html" -not -name "_not-found.html" | while read -r htmlfile; do
  dirname_of=$(dirname "$htmlfile")
  basename_noext=$(basename "$htmlfile" .html)
  target_dir="$dirname_of/$basename_noext"

  if [ -d "$target_dir" ] && [ ! -f "$target_dir/index.html" ]; then
    cp "$htmlfile" "$target_dir/index.html"
    echo "  Copied $(basename "$htmlfile") → $basename_noext/index.html"
  fi
done

# ---- Step 1b: Create URL-encoded copies of [bracket] directories ----
# Next.js generates dirs like [folder] but the HTML references %5Bfolder%5D.
# GitHub Pages does NOT decode percent-encoded paths, so we must provide both.
# Run twice: first pass copies top-level bracket dirs (including children),
# second pass encodes any bracket dirs inside the newly-created copies.
for _pass in 1 2; do
  find "$OUT_DIR" -type d -name '*\[*' | while read -r dir; do
    parent=$(dirname "$dir")
    name=$(basename "$dir")
    encoded=$(echo "$name" | sed 's/\[/%5B/g; s/\]/%5D/g')
    target="$parent/$encoded"
    if [ ! -d "$target" ]; then
      cp -r "$dir" "$target"
      echo "  Copied $name → $encoded (URL-encoded bracket dir)"
    fi
  done
done

# ---- Step 2: Create 404.html SPA redirect ----
cat > "$OUT_DIR/404.html" << 'HEREDOC'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting…</title>
  <script>
    // SPA redirect for GitHub Pages:
    // Preserve the original path via query-param redirect so the SPA
    // can do client-side routing.
    var base = "__BASE_PATH__";
    var path = window.location.pathname;
    if (base && path.startsWith(base)) {
      path = path.slice(base.length);
    }
    var segments = path.split('/').filter(Boolean);
    // Guard: if we already tried redirecting once, don't loop — go home.
    if (window.location.search.indexOf('_spa=1') !== -1) {
      window.location.replace(base + '/');
    } else if (segments.length >= 2) {
      // /folder/slug → /folder/?slug=slug&_spa=1
      var target = base + '/' + segments[0] + '/?slug=' + encodeURIComponent(segments[1]) + '&_spa=1' + window.location.hash;
      window.location.replace(target);
    } else if (segments.length === 1) {
      // /test → /test/?_spa=1  (folder page)
      window.location.replace(base + '/' + segments[0] + '/?_spa=1');
    } else {
      window.location.replace(base + '/');
    }
  </script>
</head>
<body>
  <p>Redirecting…</p>
</body>
</html>
HEREDOC

# Replace the base path placeholder
sed -i "s|__BASE_PATH__|${BASE_PATH}|g" "$OUT_DIR/404.html"

echo "Created $OUT_DIR/404.html with SPA redirect (basePath=${BASE_PATH})"
