#!/bin/sh
# Copies the RAG lab pages into rag/ (English) and rag/tr/ (Turkish).
# The English page loads the Turkish page's shared CSS and JS, so its paths are rewritten.
set -e
cd "$(dirname "$0")"
SRC=${1:-$HOME/personal/ai-portfolio/rag-lab/site}

rm -rf rag
mkdir -p rag/tr
cp "$SRC"/index.html "$SRC"/style.css "$SRC"/plain.css "$SRC"/*.js rag/tr/
cp "$SRC"/en/index.html "$SRC"/en/en.css "$SRC"/en/en.js "$SRC"/en/data-en.js rag/

sed -i '' \
  -e 's#"\.\./style\.css"#"tr/style.css"#' \
  -e 's#"\.\./plain\.css"#"tr/plain.css"#' \
  -e 's#"\.\./bm25\.js"#"tr/bm25.js"#' \
  -e 's#"\.\./metrics\.js"#"tr/metrics.js"#' \
  -e 's#<a href="\.\./index\.html">Türkçe</a>#<a href="tr/">Türkçe</a> <a href="../">Ahmet Anbar</a>#' \
  rag/index.html

sed -i '' \
  -e 's#<a href="\#terimler">Terimler</a>#&\
  <a href="../">English</a> <a href="../../">Ahmet Anbar</a>#' \
  rag/tr/index.html

grep -q 'href="tr/style.css"' rag/index.html
grep -q 'href="../../"' rag/tr/index.html
./analytics.sh
echo "rag/ ready: $(du -sh rag | cut -f1)"
