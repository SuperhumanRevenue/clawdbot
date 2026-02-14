---
name: voice-assistant
description: Unified voice interface that orchestrates speech-to-text (openai-whisper), text-to-speech (sherpa-onnx-tts), and voice calls into a coherent conversational experience. Use when the user says "voice mode", "talk to me", "listen", "read this aloud", "voice conversation", "hands-free mode", or when a voice call session needs intelligent response handling.
metadata:
  {
    "openclaw":
      {
        "emoji": "🎙️",
      },
  }
---

# Voice Assistant

Orchestrate OpenClaw's voice capabilities into a unified hands-free experience. Combines speech-to-text input, intelligent processing, and text-to-speech output.

## Available Voice Components

| Component | Skill | What it does | Required |
|-----------|-------|-------------|----------|
| Speech-to-Text (local) | openai-whisper | Transcribe audio via local Whisper model | One STT required |
| Speech-to-Text (cloud) | openai-whisper-api | Transcribe audio via OpenAI API | One STT required |
| Text-to-Speech | sherpa-onnx-tts | Generate speech from text locally | For voice output |
| Voice Calls | voice-call | Handle phone/WebRTC calls | For phone integration |

## Voice Modes

### Listen Mode
User speaks → transcribed → processed as text → response displayed (no voice output).

Best for: dictation, quick commands when reading is fine.

```
User: "voice listen"
→ Activates microphone
→ Transcribes speech to text
→ Processes as normal message
→ Returns text response
```

### Conversation Mode
User speaks → transcribed → processed → response spoken aloud.

Best for: hands-free operation, cooking, driving, walking.

```
User: "voice conversation"
→ Activates microphone + speaker
→ Transcribes speech to text
→ Processes as normal message
→ Speaks response via TTS
→ Listens for next input
```

### Read Mode
Takes existing text content and speaks it aloud.

Best for: reading emails, long documents, briefings while multitasking.

```
User: "read my morning briefing aloud"
→ Runs daily-briefing skill
→ Pipes output through TTS
→ Speaks the briefing
```

### Call Mode
Handles incoming/outgoing voice calls with intelligent responses.

Best for: phone-based interaction, remote access.

```
User: "answer calls intelligently"
→ voice-call receives audio
→ openai-whisper transcribes
→ OpenClaw processes
→ sherpa-onnx-tts generates response audio
→ voice-call plays response
```

## Voice Processing Pipeline

```
Audio Input → STT Engine → Text → OpenClaw Processing → Text Response → TTS Engine → Audio Output
                ↑                        ↑                                    ↑
          whisper/whisper-api    All skills available              sherpa-onnx-tts
```

### STT Engine Selection

| Scenario | Use | Why |
|----------|-----|-----|
| Low latency needed | openai-whisper (local) | No network round-trip |
| High accuracy needed | openai-whisper-api (cloud) | Better model, handles accents/noise |
| Offline/no internet | openai-whisper (local) | Works without connectivity |
| Long audio files | openai-whisper-api (cloud) | Handles large files efficiently |

Default: local whisper. Fall back to API if local fails or user prefers cloud.

### TTS Configuration

Response length affects TTS behavior:
- **Short** (< 100 chars): Speak directly, no chunking
- **Medium** (100-500 chars): Speak in sentence chunks for natural pacing
- **Long** (> 500 chars): Summarize first, offer to read full version

Voice responses should be concise. When a text response would use tables or code blocks, the voice version should use natural language descriptions instead.

## Voice-Adapted Responses

When in voice mode, modify response style:

| Text response | Voice adaptation |
|---------------|-----------------|
| Markdown tables | Natural language list ("You have 3 goals: first...") |
| Code blocks | "Here's the command: ..." or skip if complex |
| URLs/links | "I found an article about..." (don't read URLs) |
| Long lists (5+) | Summarize top 3, ask if user wants more |
| Emoji/symbols | Skip or describe ("checkmark", "warning") |

## Activation and Deactivation

### Start voice mode
- "voice mode" / "voice on" / "talk to me" / "hands-free"
- Specify mode: "voice listen" / "voice conversation" / "voice read"

### Stop voice mode
- "stop" / "voice off" / "quiet" / "text mode"
- Any explicit request to return to text

### Pause
- "pause" / "hold on" — suspends listening without exiting voice mode
- "resume" / "continue" — resumes

## Integration with Other Skills

Voice mode works transparently with all skills. The user speaks their request, it gets transcribed, and the normal skill routing applies:

- "What's the weather?" → weather skill → spoken response
- "Brief me" → daily-briefing → spoken summary
- "How are my goals?" → goal-tracker → spoken status
- "Back up my data" → backup-export → spoken confirmation

For multi-step workflows, voice mode provides progress updates spoken aloud between steps.

## Anti-Patterns

- Do NOT read out raw JSON, code blocks, or structured data verbatim
- Do NOT read URLs character by character
- Do NOT start TTS before STT transcription is confirmed
- Do NOT keep the microphone active after the user says "stop"
- Do NOT use voice mode for tasks that require visual review (diffs, tables, code)

## Fallback Behavior

If required components are missing:
- No STT available: "Voice input requires openai-whisper or openai-whisper-api. Install with: ..."
- No TTS available: "Voice output requires sherpa-onnx-tts. Falling back to text mode."
- Both missing: "Voice components not installed. See references/setup-guide.md for installation."

## Cross-Skill Integration

- **openai-whisper / openai-whisper-api**: STT engines
- **sherpa-onnx-tts**: TTS engine
- **voice-call**: Phone/WebRTC integration
- **skill-router**: All voice requests go through normal skill routing
- **daily-briefing**: "Read my briefing" is a natural voice-first command
