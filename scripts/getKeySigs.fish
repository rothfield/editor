#!/usr/bin/env fish

# Create a directory for the assets
mkdir -p key-signatures
cd key-signatures

# MediaWiki treats spaces and underscores the same in titles.
# We use underscores so the names are single tokens in fish.
set -l files \
  A-flat-major_f-minor.svg \
  A-major_f-sharp-minor.svg \
  B-flat-major_g-minor.svg \
  B-major_g-sharp-minor.svg \
  C-flat-major_a-flat-minor.svg \
  C-major_a-minor.svg \
  C-sharp-major_a-sharp-minor.svg \
  D-flat-major_b-flat-minor.svg \
  D-major_b-minor.svg \
  E-flat-major_c-minor.svg \
  E-major_c-sharp-minor.svg \
  F-major_d-minor.svg \
  F-sharp-major_d-sharp-minor.svg \
  G-flat-major_e-flat-minor.svg \
  G-major_e-minor.svg

for f in $files
    # Replace underscores with spaces for the wiki title
    set title (string replace -a "_" " " $f)

    set url "https://commons.wikimedia.org/wiki/Special:FilePath/$title"
    echo "Downloading $f  <-  $url"
    curl -L "$url" -o "$f"
end

echo "Done. SVGs are in:"
pwd

