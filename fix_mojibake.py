import os

# Map each mojibake sequence (as stored in the UTF-8 file) to its ASCII replacement
# These are the actual Unicode code points that appear in the files as garbled text
replacements = [
    # checkmark ✓  (mojibake of U+2713)
    ('\u00e2\u009c\u201c', '(OK)'),
    # But also the variant seen in the file: âœ"
    ('\u00e2\u009c\u0022', '(OK)'),
    # cross / close button ✕  (mojibake of U+2715)
    ('\u00e2\u009c\u2022', 'x'),
    ('\u00e2\u009c\u0095', 'x'),
    # warning ⚠  (mojibake of U+26A0)
    ('\u00e2\u009a\u00a0', '(!) '),
    ('\u00e2\u009a\u0160', '(!)\u00a0'),
    # bullet •  (mojibake of U+2022)
    ('\u00e2\u20ac\u00a2', '-'),
    # ellipsis …  (mojibake of U+2026)
    ('\u00e2\u20ac\u00a6', '...'),
    # en-dash –  (mojibake of U+2013)
    ('\u00e2\u20ac\u201c', '-'),
    # em-dash —  (mojibake of U+2014)
    ('\u00e2\u20ac\u201d', '-'),
    # left double quote "  (mojibake of U+201C)
    ('\u00e2\u20ac\u0153', '"'),
    # right double quote "  (mojibake of U+201D)
    ('\u00e2\u20ac\u009d', '"'),
    # right single quote/apostrophe '  (mojibake of U+2019)
    ('\u00e2\u20ac\u2122', "'"),
    # left single quote '  (mojibake of U+2018)
    ('\u00e2\u20ac\u02dc', "'"),
    # middle dot ·  (Â· = mojibake of U+00B7)
    ('\u00c2\u00b7', '.'),
    # arrow left ←
    ('\u00e2\u2020\u0090', '<-'),
    # arrow right →
    ('\u00e2\u2020\u0092', '->'),
    # arrow up ↑
    ('\u00e2\u2020\u0091', '^'),
    # arrow down ↓
    ('\u00e2\u2020\u0093', 'v'),
]

files = [
    r'C:\Users\koech\Desktop\MPIMS-Django\frontend\src\components\InvestigatorDashboard.js',
    r'C:\Users\koech\Desktop\MPIMS-Django\frontend\src\components\Teams.js',
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed: {filepath}')
    else:
        print(f'No changes: {filepath}')
