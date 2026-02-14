#!/usr/bin/env python3
"""Extract knowledge-worthy content from an OpenClaw session JSONL file.

Usage:
    python distill_session.py <session_file> [--knowledge-dir ./memory/knowledge]

Scans a session for facts, conclusions, patterns, and decisions.
Outputs what should be added to the knowledge base.
"""

import argparse
import json
import re
import sys
from pathlib import Path


# Patterns that indicate knowledge-worthy content
KNOWLEDGE_PATTERNS = [
    (r"(?:we decided|decision:|chose|picked|selected|went with)\s+(.+?)(?:\.|$)", "decision"),
    (r"(?:the solution is|fix is|answer is|it works because)\s+(.+?)(?:\.|$)", "finding"),
    (r"(?:lesson learned|gotcha|watch out|important:)\s+(.+?)(?:\.|$)", "lesson"),
    (r"(?:pattern:|convention:|always use|standard is)\s+(.+?)(?:\.|$)", "pattern"),
    (r"(?:the architecture|tech stack|we use|built with)\s+(.+?)(?:\.|$)", "architecture"),
]

# Patterns that indicate NOT knowledge-worthy
SKIP_PATTERNS = [
    r"^(yes|no|ok|sure|thanks|got it|hmm|ah)$",
    r"^(help|search|save|status|quit|exit)$",
    r"^/\w+",  # Commands
]


def extract_session_text(session_path: str) -> list[dict]:
    """Extract messages from a session JSONL."""
    messages = []
    with open(session_path) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
                if entry.get("type") != "message":
                    continue
                msg = entry.get("message", {})
                role = msg.get("role", "")
                if role not in ("user", "assistant"):
                    continue
                texts = []
                for content in msg.get("content", []):
                    if content.get("type") == "text":
                        texts.append(content["text"])
                if texts:
                    messages.append({
                        "role": role,
                        "text": "\n".join(texts),
                        "timestamp": entry.get("timestamp", ""),
                    })
            except json.JSONDecodeError:
                continue
    return messages


def find_knowledge(messages: list[dict]) -> list[dict]:
    """Scan messages for knowledge-worthy content."""
    findings = []

    for msg in messages:
        text = msg["text"]

        # Skip trivial messages
        if any(re.match(p, text.strip(), re.IGNORECASE) for p in SKIP_PATTERNS):
            continue

        # Check for knowledge patterns
        for pattern, category in KNOWLEDGE_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
            for match in matches:
                if len(match.strip()) > 10:  # Skip very short matches
                    findings.append({
                        "category": category,
                        "content": match.strip()[:200],
                        "role": msg["role"],
                        "timestamp": msg["timestamp"],
                    })

    return findings


def suggest_topics(findings: list[dict]) -> dict[str, list[dict]]:
    """Group findings by suggested topic."""
    topics: dict[str, list[dict]] = {}

    for finding in findings:
        # Simple topic extraction: first 2-3 significant words
        words = re.findall(r'\b\w{3,}\b', finding["content"].lower())
        topic = "-".join(words[:3]) if words else "general"
        if topic not in topics:
            topics[topic] = []
        topics[topic].append(finding)

    return topics


def main():
    parser = argparse.ArgumentParser(description="Distill knowledge from session")
    parser.add_argument("session_file", help="Path to session JSONL file")
    parser.add_argument("--knowledge-dir", default="./memory/knowledge", help="Knowledge directory")
    args = parser.parse_args()

    if not Path(args.session_file).exists():
        print(f"Session file not found: {args.session_file}", file=sys.stderr)
        sys.exit(1)

    messages = extract_session_text(args.session_file)
    if not messages:
        print("No messages found in session.")
        return

    findings = find_knowledge(messages)
    if not findings:
        print("No knowledge-worthy content found in this session.")
        return

    topics = suggest_topics(findings)

    print(f"## Knowledge Extraction Report\n")
    print(f"Session: {Path(args.session_file).name}")
    print(f"Messages analyzed: {len(messages)}")
    print(f"Findings: {len(findings)}\n")

    for topic, items in sorted(topics.items()):
        print(f"### Topic: {topic}")
        for item in items:
            print(f"- [{item['category']}] {item['content']}")
            if item["timestamp"]:
                print(f"  *(from {item['role']}, {item['timestamp'][:10]})*")
        print()

    # Check existing knowledge files
    knowledge_dir = Path(args.knowledge_dir)
    if knowledge_dir.exists():
        existing = [f.stem for f in knowledge_dir.glob("*.md")]
        if existing:
            matches = [t for t in topics if t in existing]
            if matches:
                print(f"### Existing knowledge files to update: {', '.join(matches)}")
            new_topics = [t for t in topics if t not in existing]
            if new_topics:
                print(f"### New knowledge files to create: {', '.join(new_topics)}")


if __name__ == "__main__":
    main()
