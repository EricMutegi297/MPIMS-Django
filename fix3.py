"""
Comprehensive ASCII normalizer for MPIMS frontend JS files.
Replaces all non-ASCII visible characters with ASCII equivalents.
"""
import os
import glob

FRONTEND = r'C:\Users\koech\Desktop\MPIMS-Django\frontend\src'

# (old_string, new_string) pairs - order matters (longer first)
# Using Python unicode escapes so no encoding issues in the script file

replacements = [
    # MacRoman mojibake sequences (from UTF-8 bytes misread as MacRoman)
    ('\u0393\u00c7\u00f6', ' - '),      # ΓÇö = em dash in MacRoman mojibake
    ('\u0393\u00f6\u00c7', '-'),         # ΓöÇ = box-drawing in MacRoman mojibake
    ('\u0393\u00f2\u00c9', '|'),         # ΓòÉ = double-box in MacRoman mojibake

    # Real Unicode special characters -> ASCII equivalents
    ('\u2014', ' - '),   # — em dash
    ('\u2013', ' - '),   # – en dash
    ('\u2212', '-'),     # − minus sign
    ('\u2026', '...'),   # … ellipsis
    ('\u2192', '->'),    # → right arrow
    ('\u2190', '<-'),    # ← left arrow
    ('\u2191', '^'),     # ↑ up arrow
    ('\u2193', 'v'),     # ↓ down arrow
    ('\u00d7', 'x'),     # × multiplication / close
    ('\u2715', 'x'),     # ✕ ballot X / close
    ('\u2713', '(OK)'),  # ✓ checkmark
    ('\u26a0', '(!)'),   # ⚠ warning
    ('\u00b7', '.'),     # · middle dot
    ('\u2022', '-'),     # • bullet
    ('\u201c', '"'),     # " left double quote
    ('\u201d', '"'),     # " right double quote
    ('\u2018', "'"),     # ' left single quote
    ('\u2019', "'"),     # ' right single quote
    ('\u00ab', '"'),     # « left angle quote
    ('\u00bb', '"'),     # » right angle quote
    ('\ufeff', ''),      # BOM - remove silently
]

js_files = glob.glob(os.path.join(FRONTEND, '**', '*.js'), recursive=True)
total_fixed = 0

for filepath in sorted(js_files):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        fname = os.path.basename(filepath)
        print(f'Fixed: {fname}')
        total_fixed += 1

print(f'\nDone. Fixed {total_fixed} file(s).')
