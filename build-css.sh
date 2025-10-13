#!/bin/bash

# Build CSS using UnoCSS
echo "Building CSS with UnoCSS..."

# Create dist directory if it doesn't exist
mkdir -p dist

# Generate CSS
npx unocss "index.html" "src/**/*.{js,ts,html}" -o dist/main.css

echo "CSS build complete!"
