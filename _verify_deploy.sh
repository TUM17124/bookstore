#!/bin/bash
C=/var/www/bookstore/out/_next/static/chunks/1xu28r4y_rc9-.js
echo "=== ep binding ==="
grep -o "ep=[A-Za-z0-9_$]*" "$C" | head
echo
echo "=== onSaved context ==="
grep -o ".\{280\}ep\.current?\.\(\[\]\).\{140\}" "$C"
