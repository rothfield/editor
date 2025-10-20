#!/usr/bin/env python3
"""Fix indentation in test_visual_rendering.py."""

import re

def fix_indentation():
    with open('tests/e2e/test_visual_rendering.py', 'r') as f:
        lines = f.readlines()

    fixed_lines = []
    in_test_method = False
    for i, line in enumerate(lines):
        # Detect start of test method
        if re.match(r'    @pytest\.mark\.asyncio\s*$', line):
            in_test_method = True
            fixed_lines.append(line)
        elif in_test_method and re.match(r'    async def test_\w+\(self, editor_page\):\s*$', line):
            fixed_lines.append(line)
        elif in_test_method and re.match(r'        """', line):
            # Docstring
            fixed_lines.append(line)
        elif in_test_method and line.startswith('                '):
            # Overindented line - remove extra indentation (16 spaces -> 8 spaces)
            fixed_lines.append(line[8:])
        else:
            fixed_lines.append(line)
            # Reset if we hit another method or class
            if line.startswith('    @pytest') or line.startswith('    async def ') or line.startswith('class '):
                in_test_method = False

    with open('tests/e2e/test_visual_rendering.py', 'w') as f:
        f.writelines(fixed_lines)

    print("✓ Fixed indentation")

if __name__ == '__main__':
    fix_indentation()
