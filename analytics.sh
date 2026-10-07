#!/bin/sh
# Puts the Cloudflare Web Analytics beacon (analytics.html) before </body> on every page, once.
# build.sh runs it last, since it rebuilds the rag/ pages from the RAG lab.
set -e
cd "$(dirname "$0")"
BEACON=$(cat analytics.html)
export BEACON
for page in index.html rag/index.html rag/tr/index.html; do
  grep -q cloudflareinsights "$page" && continue
  perl -0pi -e 's#</body>#$ENV{BEACON}\n</body>#' "$page"
  grep -q cloudflareinsights "$page"
done
echo "analytics on: index.html rag/index.html rag/tr/index.html"
