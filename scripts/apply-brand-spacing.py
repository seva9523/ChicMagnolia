from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNSPACED_BRAND = re.compile(
    r"(?<![A-Za-z0-9_./-])ChicMagnolia(?![A-Za-z0-9_./-])"
)
INLINE_CODE = re.compile(r"(`+[^`]*`+)")
TEXT_EXTENSIONS = {".ts", ".tsx", ".md", ".mdx", ".html", ".txt"}
IGNORED_PARTS = {".git", ".next", "node_modules", "coverage"}


def replace_outside_inline_code(line: str) -> str:
    parts = INLINE_CODE.split(line)
    return "".join(
        part if part.startswith("`") else UNSPACED_BRAND.sub("Chic Magnolia", part)
        for part in parts
    )


def replace_markdown(content: str) -> str:
    lines = content.splitlines(keepends=True)
    in_fence = False
    fence_marker = ""
    output: list[str] = []

    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            marker = stripped[:3]
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
            output.append(line)
            continue

        output.append(line if in_fence else replace_outside_inline_code(line))

    return "".join(output)


def regression_test_content() -> str:
    return """import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const sourceRoot = join(repositoryRoot, 'src');
const unspacedBrand = ['Chic', 'Magnolia'].join('');
const standaloneBrandPattern = new RegExp(
  `(?<![A-Za-z0-9_./-])${unspacedBrand}(?![A-Za-z0-9_./-])`,
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const metadata = statSync(path);
    if (metadata.isDirectory()) return sourceFiles(path);
    return /\\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('product branding', () => {
  it('uses the spaced Chic Magnolia name in user-facing source', () => {
    const violations = sourceFiles(sourceRoot)
      .filter((path) => !path.endsWith('brand-name.test.ts'))
      .filter((path) => standaloneBrandPattern.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repositoryRoot, path));

    expect(violations).toEqual([]);
  });

  it('uses the spaced name in the public email sender example', () => {
    const environmentExample = readFileSync(
      join(repositoryRoot, '.env.example'),
      'utf8',
    );

    expect(environmentExample).toContain('EMAIL_FROM=Chic Magnolia <');
  });
});
"""


def main() -> None:
    changed: list[str] = []

    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in IGNORED_PARTS for part in path.parts):
            continue

        should_process = path.suffix in TEXT_EXTENSIONS or path.name == ".env.example"
        if not should_process:
            continue

        try:
            original = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        if path.suffix in {".md", ".mdx"}:
            updated = replace_markdown(original)
        else:
            updated = UNSPACED_BRAND.sub("Chic Magnolia", original)

        if path.name == ".env.example":
            updated = updated.replace(
                "EMAIL_FROM=ChicMagnolia <",
                "EMAIL_FROM=Chic Magnolia <",
            )

        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(path.relative_to(ROOT).as_posix())

    regression_test = ROOT / "src/security/brand-name.test.ts"
    expected_test = regression_test_content()
    current_test = (
        regression_test.read_text(encoding="utf-8") if regression_test.exists() else None
    )
    if current_test != expected_test:
        regression_test.write_text(expected_test, encoding="utf-8")
        changed.append(regression_test.relative_to(ROOT).as_posix())

    print("Updated user-facing brand name in:")
    for path in sorted(set(changed)):
        print(f"- {path}")


if __name__ == "__main__":
    main()
