#!/usr/bin/env python3
"""Scan all skills/*/SKILL.md files and generate a formatted skill index.

Extracts YAML frontmatter (name, description, emoji, required bins) from each
skill and outputs a markdown table, JSON array, or compact listing.

Usage:
    python skill_index.py --path skills --format table
    python skill_index.py --format json
    python skill_index.py --format compact
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def parse_frontmatter(text: str) -> Optional[Dict[str, Any]]:
    """Extract YAML frontmatter from a SKILL.md file.

    Handles both inline JSON-style metadata and multi-line YAML metadata.
    Uses a lightweight parser to avoid hard dependency on PyYAML at import
    time, falling back to yaml.safe_load when available.
    """
    if not text.startswith("---"):
        return None

    match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return None

    raw = match.group(1)

    try:
        import yaml
        data = yaml.safe_load(raw)
        if isinstance(data, dict):
            return data
    except ImportError:
        pass
    except Exception:
        # YAML may fail on JSON5-style trailing commas in metadata blocks;
        # fall through to the manual parser.
        pass

    # Minimal fallback parser for the fields we care about
    result: Dict[str, Any] = {}
    name_m = re.search(r'^name:\s*(.+)$', raw, re.MULTILINE)
    if name_m:
        result["name"] = name_m.group(1).strip().strip('"').strip("'")

    desc_m = re.search(r'^description:\s*(.+)$', raw, re.MULTILINE)
    if desc_m:
        result["description"] = desc_m.group(1).strip().strip('"').strip("'")

    # Extract metadata: everything from "metadata:" to the end of frontmatter
    meta_m = re.search(r'^metadata:\s*(.+)$', raw, re.MULTILINE)
    if meta_m:
        # Inline JSON on same line as "metadata:"
        inline = meta_m.group(1).strip()
        if inline.startswith("{"):
            try:
                result["metadata"] = json.loads(inline)
            except json.JSONDecodeError:
                cleaned = re.sub(r',\s*\}', '}', inline)
                cleaned = re.sub(r',\s*\]', ']', cleaned)
                try:
                    result["metadata"] = json.loads(cleaned)
                except json.JSONDecodeError:
                    pass

    # Handle multi-line metadata block (metadata: followed by newline then JSON)
    if "metadata" not in result:
        meta_block = re.search(r'^metadata:\s*$', raw, re.MULTILINE)
        if meta_block:
            # Grab everything after "metadata:" to end of frontmatter
            rest = raw[meta_block.end():]
            # Find the JSON object in the remaining text
            brace_start = rest.find("{")
            if brace_start >= 0:
                # Find matching closing brace
                depth = 0
                end_pos = -1
                for i, ch in enumerate(rest[brace_start:]):
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            end_pos = brace_start + i + 1
                            break
                if end_pos > 0:
                    json_str = rest[brace_start:end_pos]
                    # Clean trailing commas (JSON5 style)
                    cleaned = re.sub(r',\s*\}', '}', json_str)
                    cleaned = re.sub(r',\s*\]', ']', cleaned)
                    try:
                        result["metadata"] = json.loads(cleaned)
                    except json.JSONDecodeError:
                        pass

    return result if result else None


def extract_emoji(metadata: Optional[Dict[str, Any]]) -> str:
    """Extract emoji from metadata.openclaw.emoji."""
    if not metadata:
        return ""
    openclaw = metadata.get("openclaw", {})
    if not isinstance(openclaw, dict):
        return ""
    return openclaw.get("emoji", "")


def extract_bins(metadata: Optional[Dict[str, Any]]) -> List[str]:
    """Extract required bins from metadata.openclaw.requires.bins."""
    if not metadata:
        return []
    openclaw = metadata.get("openclaw", {})
    if not isinstance(openclaw, dict):
        return []
    requires = openclaw.get("requires", {})
    if not isinstance(requires, dict):
        return []
    bins = requires.get("bins", [])
    if not isinstance(bins, list):
        return []
    return [b for b in bins if isinstance(b, str)]


def scan_skills(skills_path: Path) -> List[Dict[str, Any]]:
    """Scan all skill directories and extract frontmatter data."""
    skills = []

    if not skills_path.is_dir():
        eprint(f"Skills directory not found: {skills_path}")
        return skills

    for skill_dir in sorted(skills_path.iterdir()):
        if not skill_dir.is_dir():
            continue

        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue

        try:
            content = skill_md.read_text(encoding="utf-8")
        except OSError as exc:
            eprint(f"Warning: could not read {skill_md}: {exc}")
            continue

        frontmatter = parse_frontmatter(content)
        if not frontmatter:
            eprint(f"Warning: no valid frontmatter in {skill_md}")
            continue

        name = frontmatter.get("name", skill_dir.name)
        description = frontmatter.get("description", "")
        metadata = frontmatter.get("metadata")
        emoji = extract_emoji(metadata)
        bins = extract_bins(metadata)

        # Truncate description for table display
        desc_short = description
        if len(desc_short) > 100:
            desc_short = desc_short[:97] + "..."

        skills.append({
            "name": name,
            "dir": skill_dir.name,
            "description": description,
            "description_short": desc_short,
            "emoji": emoji,
            "bins": bins,
            "path": str(skill_md),
        })

    return skills


def format_table(skills: List[Dict[str, Any]]) -> str:
    """Render skills as a markdown table."""
    lines = [
        "# OpenClaw Skill Index",
        "",
        f"**{len(skills)} skills found**",
        "",
        "| # | Skill | Description | Deps |",
        "|---|-------|-------------|------|",
    ]

    for i, skill in enumerate(skills, 1):
        emoji = skill["emoji"]
        name = skill["name"]
        label = f"{emoji} {name}" if emoji else name
        deps = ", ".join(f"`{b}`" for b in skill["bins"]) if skill["bins"] else "-"
        desc = skill["description_short"]
        lines.append(f"| {i} | {label} | {desc} | {deps} |")

    # Summary footer
    total_deps = set()
    for skill in skills:
        total_deps.update(skill["bins"])

    lines.append("")
    lines.append(f"**Unique dependencies:** {', '.join(sorted(total_deps)) if total_deps else 'none'}")

    return "\n".join(lines)


def format_json(skills: List[Dict[str, Any]]) -> str:
    """Render skills as JSON array."""
    output = []
    for skill in skills:
        output.append({
            "name": skill["name"],
            "directory": skill["dir"],
            "description": skill["description"],
            "emoji": skill["emoji"],
            "required_bins": skill["bins"],
        })
    return json.dumps(output, indent=2, ensure_ascii=False)


def format_compact(skills: List[Dict[str, Any]]) -> str:
    """Render skills as a compact one-line-per-skill listing."""
    lines = [f"OpenClaw Skills ({len(skills)} total)", ""]

    for skill in skills:
        emoji = skill["emoji"]
        name = skill["name"]
        prefix = f"  {emoji} " if emoji else "  "
        deps_str = ""
        if skill["bins"]:
            deps_str = f"  [{', '.join(skill['bins'])}]"
        lines.append(f"{prefix}{name}{deps_str}")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate an index of all OpenClaw skills from SKILL.md frontmatter."
    )
    parser.add_argument(
        "--path",
        default="skills",
        help="Path to the skills directory (default: skills)",
    )
    parser.add_argument(
        "--format",
        choices=["table", "json", "compact"],
        default="table",
        help="Output format (default: table)",
    )

    args = parser.parse_args()
    skills_path = Path(args.path)

    skills = scan_skills(skills_path)

    if not skills:
        eprint("No skills found.")
        return 1

    if args.format == "table":
        print(format_table(skills))
    elif args.format == "json":
        print(format_json(skills))
    elif args.format == "compact":
        print(format_compact(skills))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
