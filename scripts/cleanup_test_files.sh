#!/bin/bash

# Script to clean up test-related files from the root directory

echo "Cleaning up test files from root directory..."

# Remove compiled test binaries (these are now built in target/debug/)
rm -f debug_document_difference
rm -f debug_test
rm -f debug_unified
rm -f keystroke_test
rm -f quick_test
rm -f simple_test
rm -f test_complex_rhythm
rm -f test_fsm_*
rm -f test_vexflow_*
rm -f test_notation_detection

# Note: Test binaries are now properly managed by Cargo in target/debug/
# You can run them with: cargo run --bin simple_test

# Remove test output files
rm -f *.flattener.clr
rm -f *.flattener.yaml
rm -f *.flattener.svg
rm -f *.lexer.json
rm -f *.tokenizer.clr
rm -f *.tokenizer.svg
rm -f *.outline
rm -f *.ly

# Remove debug images
rm -f fsm_debug_*.png
rm -f test*.png
rm -f synthetic_image_*.png
rm -f synthetic_image_*.svg
rm -f synthetic_image_*.json
rm -f web_live_*.png
rm -f temp_*.png

# Remove test input files from root (keeping test_files/ and my_test_data/ directories)
rm -f test*.123
rm -f simple.123
rm -f stdin.*
rm -f simple.*
rm -f simple_key.*
rm -f test_dash.*
rm -f test_key.*
rm -f test_key_d.*
rm -f test_key_fix.*
rm -f test_quintuplet.*
rm -f test_tie.*
rm -f test_tie_debug.*
rm -f test2.*

# Remove server test files
rm -f server_test_*

# Remove web live files
rm -f web_live_*.123

# Remove other test artifacts
rm -f test_rhythm.txt
rm -f simple_space_test.txt
rm -f chatgpt_spacial.txt
rm -f output.ly
rm -f happy_birthday.ly
rm -f x.svg
rm -f test.outline
rm -f test.png

# Remove debug log
rm -f debug.log

# Remove tar archives if they exist
rm -f music-text.tar.gz

echo "Cleanup complete!"
echo ""
echo "To prevent these files from appearing again:"
echo "1. Your .gitignore already has patterns for most of these files"
echo "2. Consider running tests with output redirected to a test_output/ directory"
echo "3. Use 'git clean -n' to preview untracked files that would be removed"
echo "4. Use 'git clean -f' to remove all untracked files (be careful!)"