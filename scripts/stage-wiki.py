#!/usr/bin/env python3
"""
Stage wiki/ for GitHub Wiki.

GitHub wikis are a flat namespace (no folders shown in the auto-sidebar), so
we map  wiki/<section>/<page>.md  →  <Section>-<Page>.md  (Title-Case).

We also:
  * Rewrite intra-wiki Markdown links to point at the flattened slugs.
  * Generate a curated _Sidebar.md.
  * Move wiki/README.md to Home.md (the wiki landing page).

Run:
    python3 scripts/stage-wiki.py            # → /tmp/theoria-wiki-staged
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "wiki"
STAGE = Path("/tmp/theoria-wiki-staged")

# Section ordering in the sidebar.
SECTIONS = [
    ("Getting Started", "getting-started"),
    ("Architecture", "architecture"),
    ("Agent", "agent"),
    ("Monitoring", "monitoring"),
    ("API", "api"),
    ("Integrations", "integrations"),
    ("Plugins", "plugins"),
    ("Deployment", "deployment"),
    ("Operations", "operations"),
    ("Security", "security"),
]

# Top-level singletons (wiki/foo.md  →  Foo.md  with prettier title for nav).
SINGLETONS = {
    "cli-reference": "CLI Reference",
    "faq": "FAQ",
    "glossary": "Glossary",
    "troubleshooting": "Troubleshooting",
}


def title_case(slug: str) -> str:
    """`high-availability` → `High-Availability` (GitHub wiki uses dashes)."""
    return "-".join(w.capitalize() for w in slug.split("-"))


def slug_for(section: str | None, page: str) -> str:
    """Build the flattened wiki slug (no .md)."""
    page_tc = title_case(page)
    if section is None:
        # Top-level page.
        return SINGLETONS.get(page, page_tc).replace(" ", "-")
    return f"{title_case(section)}-{page_tc}"


# Build a complete map of source paths → wiki slugs for link rewriting.
def build_path_map() -> dict[str, str]:
    mp: dict[str, str] = {}
    # Singletons
    for md in SRC.glob("*.md"):
        if md.name == "README.md":
            mp[md.name] = "Home"
            continue
        page = md.stem
        mp[md.name] = slug_for(None, page)
    # Sectioned
    for _, section_dir in SECTIONS:
        d = SRC / section_dir
        if not d.exists():
            continue
        for md in d.glob("*.md"):
            mp[f"{section_dir}/{md.name}"] = slug_for(section_dir, md.stem)
    return mp


LINK_RE = re.compile(r"\]\(([^)]+\.md)(#[^)]*)?\)")


def rewrite_links(content: str, current_section: str | None, path_map: dict[str, str]) -> str:
    """Rewrite [...](other.md) → [...](Slug)."""
    def repl(match: re.Match) -> str:
        target, anchor = match.group(1), match.group(2) or ""
        # Normalise relative paths.
        if target.startswith("../"):
            t = target[3:]                      # ../section/page.md or ../page.md
        elif target.startswith("./"):
            t = (current_section + "/" + target[2:]) if current_section else target[2:]
        elif "/" in target:
            t = target                          # already section/page.md
        else:
            # Same-folder reference.
            t = (current_section + "/" + target) if current_section else target

        slug = path_map.get(t)
        if slug is None:
            return match.group(0)               # leave it alone
        return f"]({slug}{anchor})"

    return LINK_RE.sub(repl, content)


def stage() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)

    path_map = build_path_map()

    # Singletons + Home.
    for md in SRC.glob("*.md"):
        if md.name == "README.md":
            (STAGE / "Home.md").write_text(rewrite_links(md.read_text(), None, path_map))
            continue
        page = md.stem
        slug = slug_for(None, page)
        (STAGE / f"{slug}.md").write_text(rewrite_links(md.read_text(), None, path_map))

    # Sectioned pages.
    for _, section_dir in SECTIONS:
        d = SRC / section_dir
        if not d.exists():
            continue
        for md in d.glob("*.md"):
            slug = slug_for(section_dir, md.stem)
            (STAGE / f"{slug}.md").write_text(
                rewrite_links(md.read_text(), section_dir, path_map)
            )

    # Sidebar.
    sidebar_lines = ["### Theoria", "", "* [Home](Home)"]
    for label, _ in [(t, "") for t in SINGLETONS.values() if t in ("FAQ",)]:
        # Pin FAQ next to Home for visibility.
        pass

    for label, section_dir in SECTIONS:
        sidebar_lines.append(f"\n**{label}**\n")
        for md in sorted((SRC / section_dir).glob("*.md")):
            slug = slug_for(section_dir, md.stem)
            display = title_case(md.stem).replace("-", " ")
            sidebar_lines.append(f"* [{display}]({slug})")

    sidebar_lines.append("\n**Reference**\n")
    for slug_key, display in SINGLETONS.items():
        slug = slug_for(None, slug_key)
        sidebar_lines.append(f"* [{display}]({slug})")

    (STAGE / "_Sidebar.md").write_text("\n".join(sidebar_lines) + "\n")

    # Footer.
    footer = (
        "Source: "
        "[github.com/Abhra0404/Theoria](https://github.com/Abhra0404/Theoria) "
        "· License: Apache 2.0\n"
    )
    (STAGE / "_Footer.md").write_text(footer)

    print(f"Staged {sum(1 for _ in STAGE.glob('*.md'))} pages → {STAGE}")


if __name__ == "__main__":
    stage()
