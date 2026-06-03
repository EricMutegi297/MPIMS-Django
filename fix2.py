import os
files = [
    r'C:\Users\koech\Desktop\MPIMS-Django\frontend\src\components\InvestigatorDashboard.js',
    r'C:\Users\koech\Desktop\MPIMS-Django\frontend\src\components\Teams.js',
]
DQ = chr(34)
SQ = chr(39)
replacements = [
    ('\u00e2\u0153\u201c', '(OK) '),
    ('\u00e2\u0153\u2022', 'x'),
    ('\u00e2\u0161\u00a0', '(!) '),
    ('\u00e2\u2020\u2019', '->'),
    ('\u00e2\u2020\u0090', '<-'),
    ('\u00e2\u2020\u2018', '^'),
    ('\u00e2\u20ac\u00a2', ' - '),
    ('\u00e2\u20ac\u00a6', '...'),
    ('\u00e2\u20ac\u201c', ' - '),
    ('\u00e2\u20ac\u201d', ' - '),
    ('\u00e2\u20ac\u0153', DQ),
    ('\u00e2\u20ac\u009d', DQ),
    ('\u00e2\u20ac\u2122', SQ),
    ('\u00e2\u20ac\u02dc', SQ),
    ('\u00c2\u00b7', '.'),
]
for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != orig:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Fixed:', os.path.basename(filepath))
    else:
        print('No changes:', os.path.basename(filepath))
