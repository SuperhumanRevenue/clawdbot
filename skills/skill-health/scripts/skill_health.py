#!/usr/bin/env python3
"""Check the health and integrity of OpenClaw skills.

Scans skills/*/SKILL.md files, validates frontmatter, verifies required
binaries, checks script syntax, and detects structural issues.

Usage:
    python skill_health.py --mode full
    python skill_health.py --mode deps
    python skill_health.py --mode structure
    python skill_health.py --mode scripts
    python skill_health.py --skill discord --verbose
    python skill_health.py --mode deps --fix
    python skill_health.py --format json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


# ---------------------------------------------------------------------------
# Frontmatter parsing
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str) -> Optional[Dict[str, Any]]:
    """Extract YAML frontmatter from SKILL.md content."""
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
        pass

    # Minimal fallback parser
    result: Dict[str, Any] = {}
    name_m = re.search(r"^name:\s*(.+)$", raw, re.MULTILINE)
    if name_m:
        result["name"] = name_m.group(1).strip().strip("\"'")

    desc_m = re.search(r"^description:\s*(.+)$", raw, re.MULTILINE)
    if desc_m:
        result["description"] = desc_m.group(1).strip().strip("\"'")

    # Inline JSON metadata on same line
    meta_m = re.search(r"^metadata:\s*(\{.+\})\s*$", raw, re.MULTILINE)
    if meta_m:
        inline = meta_m.group(1).strip()
        try:
            result["metadata"] = json.loads(inline)
        except json.JSONDecodeError:
            cleaned = re.sub(r",\s*\}", "}", inline)
            cleaned = re.sub(r",\s*\]", "]", cleaned)
            try:
                result["metadata"] = json.loads(cleaned)
            except json.JSONDecodeError:
                pass

    # Multi-line metadata block
    if "metadata" not in result:
        meta_block = re.search(r"^metadata:\s*$", raw, re.MULTILINE)
        if meta_block:
            rest = raw[meta_block.end():]
            brace_start = rest.find("{")
            if brace_start >= 0:
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
                    cleaned = re.sub(r",\s*\}", "}", json_str)
                    cleaned = re.sub(r",\s*\]", "]", cleaned)
                    try:
                        result["metadata"] = json.loads(cleaned)
                    except json.JSONDecodeError:
                        pass

    return result if result else None


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


def extract_install_hints(metadata: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Extract install hints from metadata.openclaw.install."""
    if not metadata:
        return []
    openclaw = metadata.get("openclaw", {})
    if not isinstance(openclaw, dict):
        return []
    install = openclaw.get("install", [])
    if not isinstance(install, list):
        return []
    return install


# ---------------------------------------------------------------------------
# Check helpers
# ---------------------------------------------------------------------------

class Issue:
    """A single health check issue."""

    def __init__(
        self,
        skill: str,
        category: str,
        severity: str,
        message: str,
        fixable: bool = False,
    ):
        self.skill = skill
        self.category = category
        self.severity = severity  # "error", "warning", "info"
        self.message = message
        self.fixable = fixable

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill": self.skill,
            "category": self.category,
            "severity": self.severity,
            "message": self.message,
            "fixable": self.fixable,
        }

    def __str__(self) -> str:
        icons = {"error": "[ERROR]", "warning": "[WARN]", "info": "[INFO]"}
        icon = icons.get(self.severity, "[?]")
        return f"  {icon} {self.skill}: {self.message}"


def which(binary: str) -> Optional[str]:
    """Check if a binary is available on PATH."""
    try:
        result = subprocess.run(
            ["which", binary],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def check_python_syntax(script_path: Path) -> Optional[str]:
    """Check Python script syntax with py_compile."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "py_compile", str(script_path)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip()
            return err or "syntax error"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return "could not run py_compile"
    return None


def check_bash_syntax(script_path: Path) -> Optional[str]:
    """Check bash script syntax with bash -n."""
    try:
        result = subprocess.run(
            ["bash", "-n", str(script_path)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip()
            return err or "syntax error"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return "could not run bash -n"
    return None


# ---------------------------------------------------------------------------
# Skill scanning and checks
# ---------------------------------------------------------------------------

def scan_skill(
    skill_dir: Path,
    modes: set,
    verbose: bool = False,
) -> Tuple[List[Issue], Dict[str, Any]]:
    """Run health checks on a single skill directory.

    Returns (issues, skill_info).
    """
    issues: List[Issue] = []
    skill_name = skill_dir.name
    skill_md = skill_dir / "SKILL.md"

    skill_info: Dict[str, Any] = {
        "name": skill_name,
        "path": str(skill_dir),
        "has_skill_md": skill_md.exists(),
    }

    # ---------------------------------------------------------------
    # Structure checks
    # ---------------------------------------------------------------
    if "structure" in modes or "full" in modes:
        if not skill_md.exists():
            issues.append(Issue(skill_name, "structure", "error", "SKILL.md not found"))
            return issues, skill_info

        try:
            content = skill_md.read_text(encoding="utf-8")
        except OSError as exc:
            issues.append(Issue(skill_name, "structure", "error", f"Cannot read SKILL.md: {exc}"))
            return issues, skill_info

        if not content.startswith("---"):
            issues.append(Issue(skill_name, "structure", "error", "No YAML frontmatter found"))
            return issues, skill_info

        frontmatter = parse_frontmatter(content)
        if not frontmatter:
            issues.append(Issue(skill_name, "structure", "error", "Invalid frontmatter"))
            return issues, skill_info

        skill_info["frontmatter"] = frontmatter

        # Check required fields
        fm_name = frontmatter.get("name", "")
        if not fm_name:
            issues.append(Issue(skill_name, "structure", "error", "Missing 'name' in frontmatter"))
        elif fm_name != skill_name:
            issues.append(Issue(
                skill_name, "structure", "warning",
                f"Name mismatch: frontmatter says '{fm_name}', directory is '{skill_name}'",
                fixable=True,
            ))

        description = frontmatter.get("description", "")
        if not description:
            issues.append(Issue(skill_name, "structure", "error", "Missing 'description' in frontmatter"))
        elif len(description.split()) < 5:
            issues.append(Issue(skill_name, "structure", "warning", "Description is very short (< 5 words)"))

        # Check for TODO placeholders
        if description and re.search(r"\bTODO\b", description, re.IGNORECASE):
            issues.append(Issue(
                skill_name, "structure", "warning",
                "Description contains TODO placeholder",
                fixable=True,
            ))

        if re.search(r"\bTODO\b", content, re.IGNORECASE):
            todo_count = len(re.findall(r"\bTODO\b", content, re.IGNORECASE))
            issues.append(Issue(
                skill_name, "structure", "info",
                f"SKILL.md contains {todo_count} TODO(s)",
            ))

        # Check referenced directories
        for dir_name in ["scripts", "references", "assets"]:
            if f"`{dir_name}/`" in content or f"`{dir_name}`" in content or f"/{dir_name}/" in content:
                ref_dir = skill_dir / dir_name
                if not ref_dir.is_dir():
                    issues.append(Issue(
                        skill_name, "structure", "warning",
                        f"References '{dir_name}/' directory but it does not exist",
                        fixable=True,
                    ))

    # ---------------------------------------------------------------
    # Dependency checks
    # ---------------------------------------------------------------
    if "deps" in modes or "full" in modes:
        if not skill_md.exists():
            return issues, skill_info

        try:
            content = skill_md.read_text(encoding="utf-8")
        except OSError:
            return issues, skill_info

        frontmatter = parse_frontmatter(content)
        if not frontmatter:
            return issues, skill_info

        metadata = frontmatter.get("metadata")
        bins = extract_bins(metadata)
        skill_info["required_bins"] = bins

        for binary in bins:
            path = which(binary)
            if path:
                if verbose:
                    issues.append(Issue(
                        skill_name, "deps", "info",
                        f"{binary} found at {path}",
                    ))
            else:
                # Check for install hints
                hints = extract_install_hints(metadata)
                hint_msg = ""
                if hints:
                    for h in hints:
                        if isinstance(h, dict) and h.get("kind") == "brew":
                            hint_msg = f" (try: brew install {h.get('formula', binary)})"
                            break
                issues.append(Issue(
                    skill_name, "deps", "error",
                    f"Missing binary: {binary}{hint_msg}",
                ))

    # ---------------------------------------------------------------
    # Script checks
    # ---------------------------------------------------------------
    if "scripts" in modes or "full" in modes:
        scripts_dir = skill_dir / "scripts"
        if scripts_dir.is_dir():
            for script in sorted(scripts_dir.iterdir()):
                if not script.is_file():
                    continue

                if script.suffix == ".py":
                    err = check_python_syntax(script)
                    if err:
                        issues.append(Issue(
                            skill_name, "scripts", "error",
                            f"Python syntax error in {script.name}: {err}",
                        ))
                    elif verbose:
                        issues.append(Issue(
                            skill_name, "scripts", "info",
                            f"{script.name}: syntax OK",
                        ))

                elif script.suffix == ".sh" or script.suffix == "":
                    # Check if it's a bash script
                    try:
                        first_line = script.read_text(encoding="utf-8", errors="replace").split("\n")[0]
                    except OSError:
                        continue
                    if "bash" in first_line or "sh" in first_line or script.suffix == ".sh":
                        err = check_bash_syntax(script)
                        if err:
                            issues.append(Issue(
                                skill_name, "scripts", "error",
                                f"Bash syntax error in {script.name}: {err}",
                            ))
                        elif verbose:
                            issues.append(Issue(
                                skill_name, "scripts", "info",
                                f"{script.name}: syntax OK",
                            ))

                # Check executability
                if not os.access(script, os.X_OK):
                    issues.append(Issue(
                        skill_name, "scripts", "warning",
                        f"{script.name} is not executable",
                        fixable=True,
                    ))

    return issues, skill_info


def detect_duplicates(skills_info: List[Dict[str, Any]]) -> List[Issue]:
    """Detect skills with duplicate names or overlapping descriptions."""
    issues: List[Issue] = []

    # Check for duplicate names
    name_map: Dict[str, List[str]] = {}
    for info in skills_info:
        fm = info.get("frontmatter", {})
        if not fm:
            continue
        name = fm.get("name", "")
        if name:
            name_map.setdefault(name, []).append(info["path"])

    for name, paths in name_map.items():
        if len(paths) > 1:
            dirs = [Path(p).name for p in paths]
            issues.append(Issue(
                name, "duplicates", "warning",
                f"Duplicate skill name found in: {', '.join(dirs)}",
            ))

    return issues


def apply_fixes(skill_dir: Path, issues: List[Issue]) -> int:
    """Apply automatic fixes for fixable issues. Returns count of fixes applied."""
    fixed = 0

    for issue in issues:
        if not issue.fixable:
            continue

        if "not executable" in issue.message:
            # Make script executable
            script_name = issue.message.split(" ")[0]
            scripts_dir = skill_dir / "scripts"
            script_path = scripts_dir / script_name
            if script_path.is_file():
                try:
                    script_path.chmod(script_path.stat().st_mode | 0o755)
                    print(f"  [FIXED] Made {script_name} executable")
                    fixed += 1
                except OSError:
                    pass

        elif "does not exist" in issue.message and "directory" in issue.message:
            # Create missing referenced directory
            dir_match = re.search(r"References '(\w+)/'", issue.message)
            if dir_match:
                dir_name = dir_match.group(1)
                target = skill_dir / dir_name
                try:
                    target.mkdir(parents=True, exist_ok=True)
                    print(f"  [FIXED] Created {dir_name}/ directory")
                    fixed += 1
                except OSError:
                    pass

    return fixed


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_text_output(
    all_issues: List[Issue],
    skills_info: List[Dict[str, Any]],
    modes: set,
) -> str:
    """Format results as human-readable text."""
    lines = ["Skill Health Report", "=" * 50, ""]

    total_skills = len(skills_info)
    errors = [i for i in all_issues if i.severity == "error"]
    warnings = [i for i in all_issues if i.severity == "warning"]
    healthy = total_skills - len(set(i.skill for i in errors))

    lines.append(f"  Skills scanned: {total_skills}")
    lines.append(f"  Healthy:        {healthy}")
    lines.append(f"  Errors:         {len(errors)}")
    lines.append(f"  Warnings:       {len(warnings)}")
    lines.append("")

    if not all_issues or all(i.severity == "info" for i in all_issues):
        lines.append("  All skills are healthy.")
        return "\n".join(lines)

    # Group by category
    categories = {}
    for issue in all_issues:
        if issue.severity == "info":
            continue
        categories.setdefault(issue.category, []).append(issue)

    for cat, cat_issues in sorted(categories.items()):
        cat_label = cat.title()
        lines.append(f"  {cat_label} Issues:")
        lines.append(f"  {'-' * 40}")
        for issue in cat_issues:
            lines.append(str(issue))
        lines.append("")

    return "\n".join(lines)


def format_json_output(
    all_issues: List[Issue],
    skills_info: List[Dict[str, Any]],
) -> str:
    """Format results as JSON."""
    errors = [i for i in all_issues if i.severity == "error"]
    warnings = [i for i in all_issues if i.severity == "warning"]

    output = {
        "total_skills": len(skills_info),
        "healthy": len(skills_info) - len(set(i.skill for i in errors)),
        "errors": len(errors),
        "warnings": len(warnings),
        "issues": [i.to_dict() for i in all_issues if i.severity != "info"],
        "skills": [
            {
                "name": s["name"],
                "has_skill_md": s.get("has_skill_md", False),
                "required_bins": s.get("required_bins", []),
            }
            for s in skills_info
        ],
    }

    return json.dumps(output, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check the health and integrity of OpenClaw skills."
    )
    parser.add_argument(
        "--mode",
        choices=["full", "deps", "structure", "scripts"],
        default="full",
        help="Check mode (default: full)",
    )
    parser.add_argument(
        "--skill",
        help="Check a specific skill by name (directory name)",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Automatically fix issues where possible",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed output including passing checks",
    )
    parser.add_argument(
        "--path",
        default="skills",
        help="Path to the skills directory (default: skills)",
    )

    args = parser.parse_args()

    skills_path = Path(args.path)
    if not skills_path.is_dir():
        eprint(f"Skills directory not found: {skills_path}")
        return 1

    modes = {args.mode}
    if args.mode == "full":
        modes = {"full", "structure", "deps", "scripts"}

    all_issues: List[Issue] = []
    skills_info: List[Dict[str, Any]] = []

    # Collect skill directories
    if args.skill:
        skill_dir = skills_path / args.skill
        if not skill_dir.is_dir():
            eprint(f"Skill not found: {args.skill}")
            return 1
        skill_dirs = [skill_dir]
    else:
        skill_dirs = sorted([
            d for d in skills_path.iterdir()
            if d.is_dir() and not d.name.startswith(".")
        ])

    # Run checks
    for skill_dir in skill_dirs:
        issues, info = scan_skill(skill_dir, modes, verbose=args.verbose)
        all_issues.extend(issues)
        skills_info.append(info)

        # Apply fixes if requested
        if args.fix and issues:
            fixable = [i for i in issues if i.fixable]
            if fixable:
                apply_fixes(skill_dir, fixable)

    # Detect duplicates (only in full/structure mode)
    if "structure" in modes or "full" in modes:
        dup_issues = detect_duplicates(skills_info)
        all_issues.extend(dup_issues)

    # Output
    if args.format == "json":
        print(format_json_output(all_issues, skills_info))
    else:
        print(format_text_output(all_issues, skills_info, modes))

    # Exit code: 1 if errors found
    has_errors = any(i.severity == "error" for i in all_issues)
    return 1 if has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
