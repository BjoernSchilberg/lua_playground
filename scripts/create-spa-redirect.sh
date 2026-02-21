#!/usr/bin/env bash
# Post-build: copy the [folder]/index.html as a fallback for sub-slug URLs.
# On GitHub Pages, /tutorial/some-slug will 404 because there's no matching file.
# This script copies tutorial/index.html → tutorial/404.html and creates a
# generic 404.html that redirects to the SPA with the original path preserved.

set -e

OUT_DIR="${1:-out}"
BASE_PATH="${2:-}"

# Create a 404.html at the root that redirects to the SPA
cat > "$OUT_DIR/404.html" << 'HEREDOC'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting…</title>
  <script>
    // SPA redirect for GitHub Pages:
    // Store the original path and redirect to the base page,
    // which will pick it up and do client-side routing.
    var base = "__BASE_PATH__";
    var path = window.location.pathname;
    if (base && path.startsWith(base)) {
      path = path.slice(base.length);
    }
    // Encode the path into a query parameter and redirect to the folder root
    var segments = path.split('/').filter(Boolean);
    // segments[0] = folder, segments[1] = slug
    if (segments.length >= 2) {
      var target = base + '/' + segments[0] + '/?slug=' + encodeURIComponent(segments[1]) + window.location.hash;
      window.location.replace(target);
    } else {
      // Unknown path, go home
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
