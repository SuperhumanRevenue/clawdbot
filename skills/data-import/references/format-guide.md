# Import Format Guide

## CSV (Contacts, Decisions, Generic Data)

### Structure expectations

Standard CSV with a header row. The importer uses the header to map columns to OpenClaw fields.

### Example: Contact CSV

```csv
Name,Email,Phone,Company,Title,Tags,Notes,Last Contact
Sarah Chen,sarah@example.com,+1-555-0101,Acme Corp,CTO,"client,vip","Met at conference 2025",2026-01-15
Alex Rivera,alex@rivera.io,+1-555-0202,StartupX,Founder,"partner","Introduced by Sarah",2026-02-01
Jordan Wu,jordan@example.org,,Freelance,Designer,"contractor,design",,
```

### Column mapping

The importer recognizes these column names (case-insensitive, with common aliases):

| OpenClaw field | Recognized column names |
|---------------|------------------------|
| Name (required) | `name`, `full name`, `display name`, `first name` + `last name` |
| Email | `email`, `e-mail`, `email address` |
| Phone | `phone`, `telephone`, `mobile`, `cell` |
| Company | `company`, `organization`, `org`, `employer` |
| Title/Role | `title`, `role`, `job title`, `position` |
| Tags | `tags`, `labels`, `categories`, `groups` |
| Notes | `notes`, `description`, `comments`, `bio` |
| Last Contact | `last contact`, `last seen`, `last interaction`, `date` |

### Edge cases

- **Multi-value fields**: Tags separated by commas within a quoted field (`"tag1,tag2"`) are split into individual tags
- **Missing required field**: Rows without a Name are skipped with a warning
- **Encoding**: UTF-8 expected. If the file uses Latin-1 or Windows-1252, the importer attempts auto-detection
- **Delimiter detection**: The importer sniffs for `,`, `;`, `\t`, and `|` delimiters

### Tips

- Export from Google Contacts: Contacts > Export > Google CSV format
- Export from macOS Contacts: File > Export > vCard (see vCard section instead)
- Export from Excel: Save As > CSV UTF-8

## vCard (.vcf)

### Structure

vCard is a standard format for contact data. Each contact is delimited by `BEGIN:VCARD` and `END:VCARD`. A single `.vcf` file can contain multiple contacts.

### Example

```vcf
BEGIN:VCARD
VERSION:3.0
FN:Sarah Chen
N:Chen;Sarah;;;
EMAIL;TYPE=WORK:sarah@example.com
TEL;TYPE=CELL:+1-555-0101
ORG:Acme Corp
TITLE:CTO
NOTE:Met at conference 2025. Key contact for API integration project.
CATEGORIES:client,vip
REV:2026-01-15T10:30:00Z
END:VCARD

BEGIN:VCARD
VERSION:3.0
FN:Alex Rivera
N:Rivera;Alex;;;
EMAIL:alex@rivera.io
TEL:+1-555-0202
ORG:StartupX
TITLE:Founder
NOTE:Introduced by Sarah
END:VCARD
```

### Field mapping

| vCard field | OpenClaw person file field |
|-------------|--------------------------|
| `FN` | `# {Full Name}` (heading) |
| `N` | Parsed for name ordering if FN is absent |
| `EMAIL` | `**Email:** {value}` |
| `TEL` | `**Phone:** {value}` |
| `ORG` | `**Company:** {value}` |
| `TITLE` | `**Role:** {value}` |
| `NOTE` | `## Notes` section |
| `CATEGORIES` | `**Tags:** #{tag1} #{tag2}` |
| `BDAY` | `**Birthday:** {value}` |
| `ADR` | `**Address:** {formatted}` |
| `URL` | `**URL:** {value}` |
| `PHOTO` | Skipped (binary data not imported to markdown) |
| `REV` | Used as last-modified date |

### Tips

- **vCard 2.1 vs 3.0 vs 4.0**: The importer handles all three versions. Version 4.0 uses different property syntax (e.g., `TEL;VALUE=uri:tel:+1-555-0101`)
- **Quoted-printable encoding**: vCard 2.1 uses `ENCODING=QUOTED-PRINTABLE` for non-ASCII characters. The importer decodes this automatically
- **Multi-line values**: Lines starting with a space or tab are continuation lines (folded)
- **Multiple emails/phones**: All are imported, labeled by TYPE (WORK, HOME, CELL)

## JSON (CRM Exports, Structured Data)

### Structure expectations

The importer accepts JSON in two shapes:

**Array of objects** (most common):
```json
[
  {
    "name": "Sarah Chen",
    "email": "sarah@example.com",
    "company": "Acme Corp",
    "role": "CTO",
    "tags": ["client", "vip"],
    "notes": "Met at conference 2025",
    "lastContact": "2026-01-15"
  },
  {
    "name": "Alex Rivera",
    "email": "alex@rivera.io",
    "company": "StartupX"
  }
]
```

**Object with a data key** (CRM exports often wrap data):
```json
{
  "contacts": [
    { "name": "Sarah Chen", "email": "sarah@example.com" }
  ],
  "exportDate": "2026-02-14",
  "source": "HubSpot"
}
```

The importer looks for the first array value it finds if the top-level is an object. It checks common keys: `contacts`, `people`, `data`, `records`, `results`, `items`.

### Field mapping

Same as CSV mapping (see above). JSON keys are matched case-insensitively. Nested objects are flattened:

```json
{
  "name": { "first": "Sarah", "last": "Chen" },
  "contact": { "email": "sarah@example.com", "phone": "+1-555-0101" }
}
```

Becomes: Name = "Sarah Chen", Email = "sarah@example.com", Phone = "+1-555-0101".

### HubSpot export format

```json
[
  {
    "properties": {
      "firstname": { "value": "Sarah" },
      "lastname": { "value": "Chen" },
      "email": { "value": "sarah@example.com" },
      "company": { "value": "Acme Corp" }
    }
  }
]
```

The importer unwraps the `properties.{field}.value` pattern automatically when detected.

## HTML Bookmarks (Browser Export)

### Structure

Browser bookmark exports use a Netscape bookmark format (HTML with specific DT/DL nesting). All major browsers produce this format.

### Example

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1707000000" LAST_MODIFIED="1707100000">Development</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1707000001" TAGS="dev,daily">GitHub</A>
        <DT><A HREF="https://stackoverflow.com" ADD_DATE="1707000002">Stack Overflow</A>
    </DL><p>
    <DT><H3 ADD_DATE="1707000000">Reading List</H3>
    <DL><p>
        <DT><A HREF="https://example.com/article" ADD_DATE="1707000003">Interesting Article</A>
    </DL><p>
</DL><p>
```

### Parser tips

- **Folder structure**: `<H3>` tags define folders. Nested `<DL>` tags create hierarchy. The importer preserves folder names as tags.
- **Tags**: The `TAGS` attribute (comma-separated) is used if present. Otherwise, the parent folder name becomes the tag.
- **Dates**: `ADD_DATE` and `LAST_MODIFIED` are Unix timestamps (seconds since epoch).
- **Encoding**: Files claim UTF-8 in the META tag but may contain Windows-1252 characters. The importer handles both.
- **Duplicates**: The same URL may appear in multiple folders. The importer deduplicates by URL, merging tags from all folders.

### Output format

Bookmarks are imported to `memory/knowledge/bookmarks.md`:
```markdown
# Bookmarks

## Development
- [GitHub](https://github.com) #dev #daily
- [Stack Overflow](https://stackoverflow.com) #development

## Reading List
- [Interesting Article](https://example.com/article) #reading-list
```

## Evernote ENEX (.enex)

### Structure

ENEX is Evernote's XML export format. Each file contains one or more notes.

### Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20260214T120000Z" application="Evernote" version="10.0">
  <note>
    <title>API Design Notes</title>
    <content>
      <![CDATA[<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
      <en-note>
        <div>REST API should use envelope format for all responses.</div>
        <div><br/></div>
        <div>Key decisions:</div>
        <ul>
          <li>Use JSON:API spec for pagination</li>
          <li>Rate limit at 100 req/min per API key</li>
        </ul>
      </en-note>]]>
    </content>
    <created>20260110T090000Z</created>
    <updated>20260114T150000Z</updated>
    <tag>api</tag>
    <tag>architecture</tag>
    <note-attributes>
      <source>desktop.mac</source>
      <source-url>https://example.com/api-docs</source-url>
    </note-attributes>
  </note>
</en-export>
```

### Key XML elements

| Element | Maps to |
|---------|---------|
| `<title>` | `# {Title}` heading and filename slug |
| `<content>` | Body text (after ENML-to-markdown conversion) |
| `<created>` | Change Log entry |
| `<updated>` | Change Log entry |
| `<tag>` | `**Tags:** #{tag}` (multiple `<tag>` elements) |
| `<note-attributes><source-url>` | `**Source:** {url}` |

### ENML conversion notes

- ENML (Evernote Markup Language) is a restricted subset of XHTML
- `<en-media>` elements reference attachments by hash -- these are logged but not imported
- `<en-todo>` elements represent checkboxes: `<en-todo checked="true"/>` becomes `- [x]`
- `<div>` elements map to paragraphs. `<br/>` maps to line breaks
- Tables in ENML use standard HTML `<table>` tags and convert to markdown tables
- The `<![CDATA[...]]>` wrapper must be stripped before parsing the inner ENML

### Tips

- Export from Evernote: Select notebooks > File > Export > ENEX format
- Large exports (1000+ notes) should use `--batch 50` for memory efficiency
- Notes with only attachments (no text content) are skipped with a warning

## WhatsApp Chat Export

### Structure

WhatsApp exports chat history as a plain text file with a specific timestamp format.

### Example

```
14/02/2026, 08:15 - Sarah Chen: Hey, did you see the API proposal?
14/02/2026, 08:16 - Sarah Chen: I think we should go with REST over GraphQL
14/02/2026, 08:20 - You: Yeah, I agree. REST is simpler for our use case
14/02/2026, 08:21 - You: Let's finalize the endpoint structure today
14/02/2026, 08:22 - Sarah Chen: <Media omitted>
14/02/2026, 08:25 - Sarah Chen: Sounds good. I'll draft the OpenAPI spec
14/02/2026, 09:00 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
```

### Format rules

- **Timestamp format** varies by locale:
  - US: `M/D/YY, H:MM AM/PM -` or `[M/D/YY, H:MM:SS AM/PM]`
  - EU: `DD/MM/YYYY, HH:MM -`
  - ISO: `YYYY-MM-DD, HH:MM -`
- **System messages** have no sender name (e.g., encryption notice, group changes)
- **Media**: `<Media omitted>` placeholder when exported without media
- **Multi-line messages**: Continuation lines lack a timestamp prefix
- **Contact cards**: `<attached: contact.vcf>` -- extractable as vCard

### Parser tips

- Detect the timestamp format from the first 5 lines, then apply consistently
- Skip system messages (encryption notices, "X added Y", "X left")
- Group consecutive messages from the same sender within 2 minutes as a single block
- Extract participant names from the `Sender:` prefix
- WhatsApp exports are UTF-8 with BOM on some platforms -- handle the BOM

### Import target

Chat exports are summarized into `memory/knowledge/{chat-slug}.md` with:
- Participant list
- Key topics discussed (extracted via topic detection)
- Notable decisions or action items
- Date range of the conversation

## Notion Export

### Structure

Notion exports as a ZIP file containing markdown files and a folder hierarchy matching the Notion workspace structure.

### Example directory structure

```
Export-12345678/
  Project Alpha abcd1234.md
  Project Alpha abcd1234/
    Meeting Notes ef567890.md
    Design Decisions 1234abcd.md
    Tasks db5678ef.csv
  Reading List 9876fedc.md
  Reading List 9876fedc/
    Article 1 aabb1122.md
```

### Format details

**Markdown files**:
```markdown
# Meeting Notes

Created: February 10, 2026
Tags: project-alpha, meetings

## Attendees
- Sarah Chen
- Alex Rivera

## Discussion
We reviewed the API proposal and decided to go with REST.

## Action Items
- [ ] Draft OpenAPI spec (Sarah)
- [x] Set up CI pipeline (Alex)
```

**Database exports** (CSV files):
```csv
Name,Status,Priority,Due Date,Assignee
"Draft API spec",In Progress,High,2026-02-20,"Sarah Chen"
"Set up CI",Done,Medium,2026-02-15,"Alex Rivera"
```

### Parser tips

- **Notion IDs**: Every filename has a hex suffix (e.g., `abcd1234`). Strip these during import to create clean slugs.
- **Nested pages**: Subpages appear as markdown files inside a folder named after the parent page (plus its ID). Flatten or preserve hierarchy based on user preference.
- **Database views**: CSV files represent Notion database exports. Import as structured data (contacts, tasks) or knowledge depending on content type.
- **Internal links**: Notion internal links use the format `[Page Name](Page%20Name%20abcd1234.md)`. These break after import -- convert to OpenClaw `[[topic-slug]]` links.
- **Images and files**: Exported in the same directory. Referenced via relative paths in markdown. Log references but do not import binary files.
- **Properties**: Notion page properties (dates, tags, status) appear at the top of the markdown file in a human-readable format, not as YAML frontmatter. Parse the `Created:`, `Tags:`, and similar lines.

### Import workflow

1. Unzip the Notion export
2. Walk the directory tree, identifying markdown files and CSV files
3. For each markdown file: strip Notion ID from filename, convert internal links, import to `memory/knowledge/`
4. For each CSV file: detect if it is contacts (has Name + Email) or tasks (has Status + Due Date) and route to appropriate import handler
5. Report: files imported, links that could not be resolved, binary files skipped
