#!/bin/sh
# Puts the public site URL into the prebuilt pages, so one image works for any domain.
# The image is built with a placeholder in /llms.txt, the prerendered HTML (links, link
# previews and the page's own copy of the URL), robots.txt and sitemap.xml.
set -eu

placeholder="__LINEWORK_SITE_URL__"
url="${LINEWORK_SITE_URL:-}"
url="${url%/}"

if [ -n "$url" ] && ! printf '%s' "$url" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'; then
  echo "LINEWORK_SITE_URL must be an origin such as https://linework.example.com, got: $url" >&2
  exit 1
fi

# Start from a clean copy each time, so a changed URL takes effect on restart.
rm -rf /srv/*
cp -R /usr/share/linework/. /srv/

if [ -z "$url" ]; then
  # No URL: drop the tags and lines that need an absolute one. The AI assistants page shows
  # the URL in its text, so it falls back to the app shell and is drawn in the browser, which
  # knows its own address. llms.txt gets the same stand-in as a build without a URL.
  for f in /srv/*.html; do sed -i "/=\"$placeholder/d" "$f"; done
  sed -i "/$placeholder/d" /srv/robots.txt
  sed -i "s|$placeholder|https://<this site>|g" /srv/llms.txt
  rm -f /srv/sitemap.xml /srv/llms.html
fi
for f in /srv/*.html /srv/*.txt /srv/*.xml; do
  [ -f "$f" ] && sed -i "s|$placeholder|$url|g" "$f"
done

exec "$@"
