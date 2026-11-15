#!/usr/bin/env python3
"""Repairs a cell value inside a delivered `.xlsx` without touching anything else.

The deliveries are ZIP archives; every string cell points into
`xl/sharedStrings.xml`. A documented repair (`CatchLogX-Data/docs/reparaturen.md`)
is "only the broken cells change", so this script rewrites **one shared string**
and nothing else — no library round-trip, no reformatting, no dropped parts.
`openpyxl` is explicitly not used: it silently drops `xl/externalLinks/` and
emptied 36 202 lat/long cells in `2026_S_valid_final.xlsx` (measured 2026-11-15).

The script refuses to run when the safety assumptions do not hold:

* the text must occur in exactly **one** shared string,
* the expected number of cells must reference it (the numbers differ per file
  because one extra reference sits in the `List` sheet, which must change too),
* every other ZIP entry is copied byte for byte.

Usage:
  ./repair-xlsx-cells.py <file.xlsx> --from "Old name" --to "New name" \
      [--expect-cells N] [--dry-run]

Exit codes: 0 ok, 1 the file is not what we expect, 2 bad usage.

Verify the repaired file afterwards against the real validator
(`CatchLogX/services/uploadService.ts`):
  npx tsx scripts/data/check-deliveries.ts <file.xlsx>
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

SHARED_STRINGS = "xl/sharedStrings.xml"
SHEET_RE = re.compile(r"xl/worksheets/sheet\d+\.xml$")


def find_shared_string(xml: str, text: str) -> tuple[int, list[str]]:
    """Returns the index of the `<si>` whose plain text equals `text`."""
    items = list(re.finditer(r"<si>(.*?)</si>", xml, re.S))
    matches = []
    for index, match in enumerate(items):
        plain = re.sub(r"<[^>]+>", "", match.group(1))
        if plain == text:
            matches.append((index, match))
    if len(matches) != 1:
        raise SystemExit(
            f"expected exactly one shared string {text!r}, found {len(matches)}"
        )
    return matches[0][0], [m.group(0) for m in items]


def count_cells(archive: zipfile.ZipFile, index: int) -> list[tuple[str, int]]:
    found = []
    for name in sorted(archive.namelist()):
        if not SHEET_RE.match(name):
            continue
        xml = archive.read(name).decode("utf-8")
        hits = len(
            re.findall(r'<c [^>]*t="s"[^>]*>\s*<v>%d</v>' % index, xml)
        )
        if hits:
            found.append((name, hits))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--from", dest="old", required=True)
    parser.add_argument("--to", dest="new", required=True)
    parser.add_argument(
        "--expect-cells",
        type=int,
        default=None,
        help="fail unless exactly this many cells reference the string",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with zipfile.ZipFile(args.file) as archive:
        xml = archive.read(SHARED_STRINGS).decode("utf-8")
        index, _items = find_shared_string(xml, args.old)
        cells = count_cells(archive, index)
        total = sum(count for _name, count in cells)
        print(f"file          {args.file}")
        print(f"shared string #{index}: {args.old!r}")
        for name, count in cells:
            print(f"  {name}: {count} cell(s)")
        print(f"total         {total} cell(s)")
        if args.expect_cells is not None and total != args.expect_cells:
            print(
                f"REFUSED: expected {args.expect_cells} cells, found {total}",
                file=sys.stderr,
            )
            return 1

        replaced = xml.replace(
            f"<si><t>{args.old}</t></si>",
            f"<si><t>{args.new}</t></si>",
            1,
        )
        if replaced == xml:
            # The string may be stored with attributes or rich-text runs.
            print(
                "REFUSED: the shared string is not a plain `<si><t>…</t></si>`; "
                "inspect it before repairing",
                file=sys.stderr,
            )
            return 1

        if args.dry_run:
            print("dry run — nothing written")
            return 0

        # Copy every entry byte for byte, replacing only sharedStrings.xml.
        # The order and the compression of the other parts stay as delivered.
        with tempfile.NamedTemporaryFile(
            dir=args.file.parent, suffix=".xlsx", delete=False
        ) as tmp:
            tmp_path = Path(tmp.name)
        try:
            with zipfile.ZipFile(args.file) as src, zipfile.ZipFile(
                tmp_path, "w"
            ) as dst:
                for item in src.infolist():
                    data = src.read(item.filename)
                    if item.filename == SHARED_STRINGS:
                        data = replaced.encode("utf-8")
                    dst.writestr(item, data)
            shutil.move(tmp_path, args.file)
        finally:
            tmp_path.unlink(missing_ok=True)

    print(f"repaired: {args.old!r} -> {args.new!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
