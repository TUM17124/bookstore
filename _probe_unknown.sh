#!/bin/bash
S=/var/www/bookstore_pdf_service
echo "=== service tree ==="
ls $S
echo
echo "=== js/mjs source (exclude node_modules) ==="
find $S -maxdepth 3 \( -name "*.js" -o -name "*.mjs" -o -name "*.ts" \) -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null | head -30
echo
echo "=== 'Unknown text' in service source ==="
grep -rn "Unknown text" $S --include=*.js --include=*.mjs --include=*.ts --exclude-dir=node_modules 2>/dev/null | head
echo
echo "=== 'Unknown' (any) in service src ==="
grep -rn "Unknown" $S/src $S/server.js $S/index.js 2>/dev/null | head -20
