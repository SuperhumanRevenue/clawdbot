#!/usr/bin/env python3
"""Test and validate OpenClaw skills at multiple levels.

Level 1 (content): Check SKILL.md quality -- no TODOs, substantive description,
    examples present, anti-patterns section, cross-skill section.
Level 2 (dry-run): Validate script syntax, check dependency availability.
Level 3 (integration): Test skill chains and cross-skill references.

Usage:
    python test_skill.py --level content --skill discord
    python test_skill.py --level content --all
    python test_skill.py --level dry-run --skill weather --with-scripts
    python test_skill.py --level integration --chain "skills-manager,skill-router"
    python test_skill.py --level content --category communication
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

    # Minimal fallback
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


# ---------------------------------------------------------------------------
# Test result tracking
# ---------------------------------------------------------------------------

class TestResult:
    """A single test result."""

    def __init__(self, skill: str, test: str, passed: bool, message: str):
        self.skill = skill
        self.test = test
        self.passed = passed
        self.message = message

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill": self.skill,
            "test": self.test,
            "passed": self.passed,
            "message": self.message,
        }

    def __str__(self) -> str:
        icon = "PASS" if self.passed else "FAIL"
        return f"  [{icon}] {self.test}: {self.message}"


# ---------------------------------------------------------------------------
# Content quality tests
# ---------------------------------------------------------------------------

def test_content_quality(
    skill_dir: Path,
    verbose: bool = False,
) -> List[TestResult]:
    """Run content quality checks on a skill's SKILL.md."""
    results: List[TestResult] = []
    skill_name = skill_dir.name
    skill_md = skill_dir / "SKILL.md"

    # Test: SKILL.md exists
    if not skill_md.exists():
        results.append(TestResult(skill_name, "skill-md-exists", False, "SKILL.md not found"))
        return results

    results.append(TestResult(skill_name, "skill-md-exists", True, "SKILL.md found"))

    try:
        content = skill_md.read_text(encoding="utf-8")
    except OSError as exc:
        results.append(TestResult(skill_name, "skill-md-readable", False, str(exc)))
        return results

    # Test: Valid frontmatter
    frontmatter = parse_frontmatter(content)
    if not frontmatter:
        results.append(TestResult(skill_name, "frontmatter-valid", False, "No valid frontmatter"))
        return results
    results.append(TestResult(skill_name, "frontmatter-valid", True, "Valid frontmatter"))

    # Test: Name present and matches directory
    fm_name = frontmatter.get("name", "")
    if not fm_name:
        results.append(TestResult(skill_name, "name-present", False, "Missing name field"))
    elif fm_name != skill_name:
        results.append(TestResult(
            skill_name, "name-matches-dir", False,
            f"Name '{fm_name}' does not match directory '{skill_name}'"
        ))
    else:
        results.append(TestResult(skill_name, "name-present", True, f"Name: {fm_name}"))

    # Test: Description is substantive (> 20 words)
    description = frontmatter.get("description", "")
    if not description:
        results.append(TestResult(skill_name, "description-present", False, "Missing description"))
    else:
        word_count = len(description.split())
        if word_count < 20:
            results.append(TestResult(
                skill_name, "description-substantive", False,
                f"Description too short ({word_count} words, need >= 20)"
            ))
        else:
            results.append(TestResult(
                skill_name, "description-substantive", True,
                f"Description has {word_count} words"
            ))

    # Test: No TODO placeholders
    todo_matches = re.findall(r"\bTODO\b", content, re.IGNORECASE)
    if todo_matches:
        results.append(TestResult(
            skill_name, "no-todos", False,
            f"Found {len(todo_matches)} TODO placeholder(s)"
        ))
    else:
        results.append(TestResult(skill_name, "no-todos", True, "No TODOs found"))

    # Strip frontmatter for body analysis
    body = re.sub(r"^---\n.*?\n---\n?", "", content, count=1, flags=re.DOTALL)

    # Test: Has concrete examples (code blocks or commands)
    code_blocks = re.findall(r"```", body)
    inline_code = re.findall(r"`[^`]+`", body)
    has_examples = len(code_blocks) >= 2 or len(inline_code) >= 3
    if has_examples:
        results.append(TestResult(
            skill_name, "has-examples", True,
            f"Found {len(code_blocks) // 2} code block(s), {len(inline_code)} inline code ref(s)"
        ))
    else:
        results.append(TestResult(
            skill_name, "has-examples", False,
            "No concrete examples or commands found"
        ))

    # Test: Anti-patterns section present
    has_antipatterns = bool(re.search(
        r"^#+\s*(anti.?pattern|don.?t|avoid|never|common mistake|pitfall)",
        body, re.IGNORECASE | re.MULTILINE
    ))
    if has_antipatterns:
        results.append(TestResult(
            skill_name, "has-anti-patterns", True,
            "Anti-patterns section found"
        ))
    else:
        results.append(TestResult(
            skill_name, "has-anti-patterns", False,
            "No anti-patterns section found"
        ))

    # Test: Cross-skill integration section present
    has_cross_skill = bool(re.search(
        r"^#+\s*(cross.?skill|integrat|related skill|works with|chain|combo|with other skill)",
        body, re.IGNORECASE | re.MULTILINE
    ))
    if has_cross_skill:
        results.append(TestResult(
            skill_name, "has-cross-skill", True,
            "Cross-skill section found"
        ))
    else:
        results.append(TestResult(
            skill_name, "has-cross-skill", False,
            "No cross-skill integration section found"
        ))

    # Test: {baseDir} used correctly (no hardcoded absolute paths to scripts)
    hardcoded = re.findall(r"(?:skills/\w+/scripts/|/home/\w+/.*?scripts/)", body)
    basedir_refs = re.findall(r"\{baseDir\}", body)
    if hardcoded and not basedir_refs:
        results.append(TestResult(
            skill_name, "basedir-paths", False,
            f"Found {len(hardcoded)} hardcoded path(s), should use {{baseDir}}"
        ))
    else:
        results.append(TestResult(
            skill_name, "basedir-paths", True,
            "Path references look correct"
        ))

    # Test: Referenced scripts/references/assets exist
    for dir_name in ["scripts", "references", "assets"]:
        if (f"`{dir_name}/`" in content or f"`{dir_name}`" in content
                or f"/{dir_name}/" in content or f"{dir_name}/" in body):
            ref_dir = skill_dir / dir_name
            if not ref_dir.is_dir():
                results.append(TestResult(
                    skill_name, f"ref-dir-{dir_name}", False,
                    f"References '{dir_name}/' but directory does not exist"
                ))
            else:
                results.append(TestResult(
                    skill_name, f"ref-dir-{dir_name}", True,
                    f"'{dir_name}/' exists"
                ))

    return results


# ---------------------------------------------------------------------------
# Dry-run tests
# ---------------------------------------------------------------------------

def which(binary: str) -> Optional[str]:
    """Check if a binary is available on PATH."""
    try:
        result = subprocess.run(
            ["which", binary], capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def test_dry_run(
    skill_dir: Path,
    with_scripts: bool = False,
) -> List[TestResult]:
    """Run dry-run checks: dependencies and script syntax."""
    results: List[TestResult] = []
    skill_name = skill_dir.name
    skill_md = skill_dir / "SKILL.md"

    if not skill_md.exists():
        results.append(TestResult(skill_name, "skill-md-exists", False, "SKILL.md not found"))
        return results

    try:
        content = skill_md.read_text(encoding="utf-8")
    except OSError:
        results.append(TestResult(skill_name, "skill-md-readable", False, "Cannot read SKILL.md"))
        return results

    frontmatter = parse_frontmatter(content)
    if not frontmatter:
        results.append(TestResult(skill_name, "frontmatter-valid", False, "Invalid frontmatter"))
        return results

    # Check dependencies
    metadata = frontmatter.get("metadata")
    bins = extract_bins(metadata)

    if bins:
        all_found = True
        for binary in bins:
            path = which(binary)
            if path:
                results.append(TestResult(
                    skill_name, f"dep-{binary}", True,
                    f"{binary} found at {path}"
                ))
            else:
                results.append(TestResult(
                    skill_name, f"dep-{binary}", False,
                    f"{binary} not found on PATH"
                ))
                all_found = False

        if all_found:
            results.append(TestResult(
                skill_name, "all-deps", True,
                f"All {len(bins)} dependencies available"
            ))
    else:
        results.append(TestResult(
            skill_name, "deps-none", True,
            "No binary dependencies declared"
        ))

    # Check script syntax
    if with_scripts:
        scripts_dir = skill_dir / "scripts"
        if scripts_dir.is_dir():
            for script in sorted(scripts_dir.iterdir()):
                if not script.is_file():
                    continue

                if script.suffix == ".py":
                    try:
                        result = subprocess.run(
                            [sys.executable, "-m", "py_compile", str(script)],
                            capture_output=True, text=True, timeout=10,
                        )
                        if result.returncode == 0:
                            results.append(TestResult(
                                skill_name, f"script-{script.name}", True,
                                "Python syntax OK"
                            ))
                        else:
                            err = result.stderr.strip()[:100]
                            results.append(TestResult(
                                skill_name, f"script-{script.name}", False,
                                f"Python syntax error: {err}"
                            ))
                    except (subprocess.TimeoutExpired, FileNotFoundError):
                        results.append(TestResult(
                            skill_name, f"script-{script.name}", False,
                            "Could not run py_compile"
                        ))

                elif script.suffix == ".sh":
                    try:
                        result = subprocess.run(
                            ["bash", "-n", str(script)],
                            capture_output=True, text=True, timeout=10,
                        )
                        if result.returncode == 0:
                            results.append(TestResult(
                                skill_name, f"script-{script.name}", True,
                                "Bash syntax OK"
                            ))
                        else:
                            err = result.stderr.strip()[:100]
                            results.append(TestResult(
                                skill_name, f"script-{script.name}", False,
                                f"Bash syntax error: {err}"
                            ))
                    except (subprocess.TimeoutExpired, FileNotFoundError):
                        results.append(TestResult(
                            skill_name, f"script-{script.name}", False,
                            "Could not run bash -n"
                        ))
        else:
            results.append(TestResult(
                skill_name, "scripts-dir", True,
                "No scripts/ directory (nothing to check)"
            ))

    return results


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

def test_integration(
    skills_path: Path,
    chain: List[str],
) -> List[TestResult]:
    """Test a chain of skills for integration compatibility."""
    results: List[TestResult] = []

    # Verify all skills in chain exist
    for skill_name in chain:
        skill_dir = skills_path / skill_name
        if not skill_dir.is_dir():
            results.append(TestResult(
                skill_name, "chain-exists", False,
                f"Skill '{skill_name}' not found in skills/"
            ))
            return results
        results.append(TestResult(
            skill_name, "chain-exists", True,
            f"Skill directory exists"
        ))

    # Verify all skills have valid frontmatter
    skill_data: Dict[str, Dict[str, Any]] = {}
    for skill_name in chain:
        skill_md = skills_path / skill_name / "SKILL.md"
        if not skill_md.exists():
            results.append(TestResult(
                skill_name, "chain-skill-md", False,
                "SKILL.md not found"
            ))
            continue

        content = skill_md.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(content)
        if not frontmatter:
            results.append(TestResult(
                skill_name, "chain-frontmatter", False,
                "Invalid frontmatter"
            ))
            continue

        skill_data[skill_name] = {
            "frontmatter": frontmatter,
            "content": content,
        }

    # Check cross-references between skills in the chain
    for i, skill_name in enumerate(chain):
        if skill_name not in skill_data:
            continue

        content = skill_data[skill_name]["content"]

        # Check if this skill references other skills in the chain
        for other in chain:
            if other == skill_name:
                continue
            if other in content:
                results.append(TestResult(
                    skill_name, f"chain-ref-{other}", True,
                    f"References '{other}' in SKILL.md"
                ))
            else:
                results.append(TestResult(
                    skill_name, f"chain-ref-{other}", False,
                    f"Does not reference '{other}' -- integration may be undocumented"
                ))

    # Verify all dependencies in the chain are met
    all_bins: Dict[str, List[str]] = {}
    for skill_name in chain:
        if skill_name not in skill_data:
            continue
        metadata = skill_data[skill_name]["frontmatter"].get("metadata")
        bins = extract_bins(metadata)
        if bins:
            all_bins[skill_name] = bins

    missing_deps = []
    for skill_name, bins in all_bins.items():
        for binary in bins:
            if not which(binary):
                missing_deps.append(f"{skill_name}:{binary}")

    if missing_deps:
        results.append(TestResult(
            "chain", "chain-deps", False,
            f"Missing dependencies for chain: {', '.join(missing_deps)}"
        ))
    else:
        results.append(TestResult(
            "chain", "chain-deps", True,
            f"All chain dependencies satisfied"
        ))

    return results


# ---------------------------------------------------------------------------
# Category mapping
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS = {
    "communication": ["discord", "slack", "bluebubbles", "imsg", "himalaya",
                       "wacli", "voice-call", "voice-assistant"],
    "productivity": ["notion", "obsidian", "things-mac", "trello",
                      "apple-notes", "apple-reminders", "bear-notes"],
    "development": ["coding-agent", "github", "tmux"],
    "media": ["camsnap", "gifgrep", "openai-image-gen", "nano-banana-pro",
              "nano-pdf", "video-frames", "peekaboo", "songsee",
              "spotify-player", "sonoscli", "canvas"],
    "meta": ["skills-manager", "skill-health", "skill-testing", "skill-creator",
             "skill-router", "mcporter", "nlp-config"],
    "memory": ["relationship-crm", "knowledge-distiller", "decision-journal",
               "proactive-recall", "session-logs", "data-import"],
    "automation": ["playbook-automations", "daily-briefing", "weekly-insights",
                    "goal-tracker", "predictive-assistant", "cross-channel-threads"],
    "analytics": ["analytics-dashboard", "model-usage", "healthcheck"],
    "utility": ["weather", "food-order", "1password", "openhue", "backup-export",
                "summarize", "blogwatcher", "oracle"],
}


def get_skills_for_category(category: str) -> List[str]:
    """Get skill names for a given category."""
    return CATEGORY_KEYWORDS.get(category.lower(), [])


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_results(
    results: List[TestResult],
    fmt: str = "text",
) -> str:
    """Format test results for output."""
    if fmt == "json":
        passed = [r for r in results if r.passed]
        failed = [r for r in results if not r.passed]
        output = {
            "total": len(results),
            "passed": len(passed),
            "failed": len(failed),
            "results": [r.to_dict() for r in results],
        }
        return json.dumps(output, indent=2)

    lines = []

    # Group by skill
    skills: Dict[str, List[TestResult]] = {}
    for r in results:
        skills.setdefault(r.skill, []).append(r)

    total_passed = 0
    total_failed = 0

    for skill_name, skill_results in skills.items():
        passed = sum(1 for r in skill_results if r.passed)
        failed = sum(1 for r in skill_results if not r.passed)
        total_passed += passed
        total_failed += failed

        status = "PASS" if failed == 0 else "FAIL"
        lines.append(f"\n  {skill_name} [{status}] ({passed}/{passed + failed} tests passed)")
        lines.append(f"  {'~' * 45}")

        for r in skill_results:
            lines.append(str(r))

    lines.insert(0, "")
    lines.insert(0, f"  Passed: {total_passed}  |  Failed: {total_failed}  |  Total: {total_passed + total_failed}")
    lines.insert(0, "=" * 55)
    lines.insert(0, "Skill Test Results")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test and validate OpenClaw skills."
    )
    parser.add_argument(
        "--level",
        choices=["content", "dry-run", "integration"],
        default="content",
        help="Test level (default: content)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Test all skills",
    )
    parser.add_argument(
        "--skill",
        help="Test a specific skill by name",
    )
    parser.add_argument(
        "--category",
        choices=list(CATEGORY_KEYWORDS.keys()),
        help="Test all skills in a category",
    )
    parser.add_argument(
        "--with-scripts",
        action="store_true",
        help="Also validate script syntax in dry-run mode",
    )
    parser.add_argument(
        "--chain",
        help="Comma-separated skill names for integration testing",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
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

    all_results: List[TestResult] = []

    # Determine which skills to test
    if args.level == "integration":
        if not args.chain:
            eprint("Error: --chain is required for integration tests")
            eprint("Example: --chain discord,slack,cross-channel-threads")
            return 1

        chain = [s.strip() for s in args.chain.split(",")]
        results = test_integration(skills_path, chain)
        all_results.extend(results)

    else:
        # Determine skill list
        skill_names: List[str] = []

        if args.skill:
            skill_names = [args.skill]
        elif args.category:
            skill_names = get_skills_for_category(args.category)
            if not skill_names:
                eprint(f"No skills found for category: {args.category}")
                return 1
        elif args.all:
            skill_names = sorted([
                d.name for d in skills_path.iterdir()
                if d.is_dir() and not d.name.startswith(".")
                and (d / "SKILL.md").exists()
            ])
        else:
            eprint("Error: specify --skill, --category, or --all")
            return 1

        for skill_name in skill_names:
            skill_dir = skills_path / skill_name
            if not skill_dir.is_dir():
                all_results.append(TestResult(
                    skill_name, "exists", False,
                    f"Skill directory not found: {skill_dir}"
                ))
                continue

            if args.level == "content":
                results = test_content_quality(skill_dir)
                all_results.extend(results)

            elif args.level == "dry-run":
                results = test_dry_run(skill_dir, with_scripts=args.with_scripts)
                all_results.extend(results)

    # Output
    print(format_results(all_results, fmt=args.format))

    # Exit code
    has_failures = any(not r.passed for r in all_results)
    return 1 if has_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
