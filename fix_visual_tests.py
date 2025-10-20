#!/usr/bin/env python3
"""Script to fix test_visual_rendering.py to use editor_page fixture."""

import re

def fix_test_file():
    with open('tests/e2e/test_visual_rendering.py', 'r') as f:
        content = f.read()

    # Remove duplicate @pytest.mark.asyncio decorators
    content = re.sub(r'@pytest\.mark\.asyncio\s+@pytest\.mark\.asyncio', '@pytest.mark.asyncio', content)

    # Pattern to match test methods that create their own browser
    # This pattern matches from the function start through the try block opening
    test_pattern = r'(    )(@pytest\.mark\.asyncio\s+)?async def (test_\w+)\(self\):\s+"""([^"]+)"""\s+async with async_playwright\(\) as p:\s+browser = await p\.chromium\.launch\(\)\s+page = await browser\.new_page\(\)\s+try:\s+await self\.setup_method\(page\)\s+'

    def replace_test_start(match):
        indent = match.group(1)
        test_name = match.group(3)
        docstring = match.group(4)
        return f'''{indent}@pytest.mark.asyncio
{indent}async def {test_name}(self, editor_page):
{indent}    """{docstring}"""
{indent}    '''

    content = re.sub(test_pattern, replace_test_start, content)

    # Now replace all instances of 'page' with 'editor_page' within test methods
    # This is tricky, so we'll do it test by test

    # Find all test methods
    test_starts = [m.start() for m in re.finditer(r'    @pytest\.mark\.asyncio\s+async def test_', content)]

    # For each test, replace 'page' with 'editor_page' and remove browser.close()
    for i, start in enumerate(test_starts):
        # Find the end of this test (start of next test or end of class)
        if i < len(test_starts) - 1:
            end = test_starts[i + 1]
        else:
            # Find the end of the file or class
            end = len(content)

        test_content = content[start:end]

        # Replace page with editor_page (but not in comments or strings about playwright)
        # Be careful not to replace 'page' in 'async_playwright'
        test_content = re.sub(r'\bpage\b(?!r)', 'editor_page', test_content)

        # Remove the finally block with browser.close()
        test_content = re.sub(r'\s+finally:\s+await browser\.close\(\)\s*', '\n', test_content)

        # Reconstruct content
        content = content[:start] + test_content + content[end:]

    # Write the fixed content
    with open('tests/e2e/test_visual_rendering.py', 'w') as f:
        f.write(content)

    print("✓ Fixed test_visual_rendering.py")
    print(f"  - Converted {len(test_starts)} test methods to use editor_page fixture")
    print("  - Removed manual browser management")
    print("  - Removed setup_method calls")

if __name__ == '__main__':
    fix_test_file()
