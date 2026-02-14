# Alternative Briefing Formats

## 1. Executive Summary (for stakeholders)

```markdown
## Status Report — {date}

**Overall**: {Green/Yellow/Red}
**Key Update**: {1 sentence on the most important thing}
**Decisions**: {count} made this period
**Blockers**: {count or "None"}
**Next milestone**: {description} ({date})
```

Use when sending briefings to Slack/Discord channels with non-technical audience.

## 2. Sprint-Style (for agile teams)

```markdown
## Sprint Check-in — {date}

**Done since last check-in**:
- {completed item}

**In progress**:
- {active item} — {% or status}

**Blocked**:
- {blocker} — needs: {what}

**Coming up**:
- {next item}
```

Good for daily standups via WhatsApp or Telegram where brevity matters.

## 3. Changelog (for dev-heavy periods)

```markdown
## Changelog — {date}

### Added
- {new feature or capability}

### Changed
- {modification to existing behavior}

### Fixed
- {bug fix or resolution}

### Pending
- {open items requiring attention}
```

Best when most activity is code/feature development across sessions.

## 4. Minimal (for quick checks)

```markdown
{date}: {N} decisions, {N} open threads, {N} follow-ups due.
Top: {most urgent item}.
```

Single line. Use for automated Telegram/Signal pushes where a full briefing would be intrusive.
