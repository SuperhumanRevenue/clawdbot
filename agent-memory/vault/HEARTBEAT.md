---
type: heartbeat
scope: checklist
tags:
  - agent/heartbeat
  - agent/monitoring
---

# Heartbeat Checklist

> This file defines what the heartbeat checks on every cycle.
> Edit this to add or remove monitoring tasks.
> Keep it empty to skip heartbeat runs and save API costs.

## Active Checks

- Check Slack for unread messages or mentions that need a response
- Check HubSpot for overdue tasks or deals needing follow-up
- Check Fathom for new meeting recordings with action items
- Check Notion for recently updated pages relevant to current projects
- Scan Google Drive for documents shared with me or recently modified
- Check Airtable for records that changed since last check
- Review Cursor projects for uncommitted work or failing builds

## Alerts

<!-- Add specific conditions that should trigger alerts -->
<!-- Example: "Alert if any HubSpot deal is stuck in the same stage for > 7 days" -->
<!-- Example: "Alert if Slack DMs are unread for > 2 hours" -->

## Notes

<!-- The agent reads this file on every heartbeat cycle -->
<!-- If nothing matches, the agent replies HEARTBEAT_OK and no alert is sent -->
<!-- Edit anytime — changes take effect on the next heartbeat cycle -->
