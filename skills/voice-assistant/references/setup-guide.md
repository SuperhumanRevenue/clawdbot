# Voice Component Setup Guide

## Overview

The voice-assistant skill orchestrates three independent components. Each must be installed separately:

| Component | Skill | Purpose | Required? |
|-----------|-------|---------|-----------|
| openai-whisper | openai-whisper | Local speech-to-text | One STT required |
| OpenAI Whisper API | openai-whisper-api | Cloud speech-to-text | One STT required |
| sherpa-onnx-tts | sherpa-onnx-tts | Local text-to-speech | For voice output |
| Twilio/Telnyx/Plivo | voice-call | Phone call integration | For phone calls |

Minimum setup: Install one STT engine (local Whisper recommended). Add TTS for full voice conversation mode.

## Installing openai-whisper (Local STT)

### macOS (Homebrew)

```bash
brew install openai-whisper
```

This installs the `whisper` CLI and its Python dependencies.

### Linux / Manual install

```bash
pip install -U openai-whisper
```

Requirements:
- Python 3.9+
- ffmpeg (for audio format conversion)

Install ffmpeg if not present:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg
```

### Verify installation

```bash
whisper --help
```

Expected: Help text showing usage, model options, and output format flags.

### First-time model download

Models download automatically on first use to `~/.cache/whisper/`. Sizes:

| Model | Size | Speed | Accuracy | Recommended for |
|-------|------|-------|----------|----------------|
| tiny | 39 MB | Fastest | Low | Testing only |
| base | 74 MB | Fast | Moderate | Quick transcription |
| small | 244 MB | Moderate | Good | Daily use |
| medium | 769 MB | Slow | Very good | Meetings, noisy audio |
| turbo | 809 MB | Moderate | Very good | Default on Homebrew install |
| large-v3 | 1.55 GB | Slowest | Best | Critical accuracy |

To pre-download a model:
```bash
whisper /dev/null --model medium 2>&1 | head -5
# Downloads the model, then errors on empty input (expected)
```

### Quick test

```bash
# Record a short audio clip (macOS)
say -o /tmp/test.aiff "Hello from OpenClaw voice assistant"

# Transcribe it
whisper /tmp/test.aiff --model base --output_format txt --output_dir /tmp/
cat /tmp/test.txt
```

### Troubleshooting

**Problem**: `whisper: command not found`
- Homebrew: Run `brew link openai-whisper`
- pip: Ensure `~/.local/bin` (Linux) or the pip scripts directory is on PATH:
  ```bash
  python -m whisper --help  # test if the module is installed
  export PATH="$(python -m site --user-base)/bin:$PATH"  # add to PATH
  ```

**Problem**: `RuntimeError: CUDA out of memory`
- Whisper defaults to GPU if CUDA is available. Force CPU:
  ```bash
  whisper audio.mp3 --model medium --device cpu
  ```

**Problem**: `FileNotFoundError: ffmpeg`
- Install ffmpeg (see above). Whisper requires it for non-WAV audio formats.

**Problem**: Slow transcription on first run
- The model is downloading. Check `~/.cache/whisper/` for download progress. Subsequent runs use the cached model.

**Problem**: Poor accuracy with accented speech
- Use a larger model (`medium` or `large-v3`)
- Specify the language: `whisper audio.mp3 --language en`

## Configuring openai-whisper-api (Cloud STT)

### Prerequisites

- An OpenAI API key with access to the Audio API
- `curl` installed (present on most systems)

### Set the API key

**Option 1: Environment variable** (recommended):
```bash
export OPENAI_API_KEY="sk-..."
```

Add to your shell profile (`~/.zshrc`, `~/.bashrc`) for persistence.

**Option 2: OpenClaw config**:

Edit `~/.openclaw/openclaw.json`:
```json5
{
  skills: {
    entries: {
      "openai-whisper-api": {
        apiKey: "sk-...",
      },
    },
  },
}
```

### Verify setup

```bash
# Quick test with a sample audio file
curl -s https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model="whisper-1" \
  -F file="@/tmp/test.aiff" \
  -F response_format="text"
```

Expected: Transcribed text output.

### Using the bundled script

```bash
# Basic transcription
skills/openai-whisper-api/scripts/transcribe.sh /path/to/audio.m4a

# With options
skills/openai-whisper-api/scripts/transcribe.sh /path/to/audio.ogg --language en
skills/openai-whisper-api/scripts/transcribe.sh /path/to/audio.m4a --json --out /tmp/result.json
skills/openai-whisper-api/scripts/transcribe.sh /path/to/audio.m4a --prompt "Speaker names: Peter, Daniel"
```

### Cost awareness

OpenAI Whisper API pricing is per minute of audio. As of early 2026:
- whisper-1: $0.006 per minute

A 30-minute meeting recording costs approximately $0.18.

### Troubleshooting

**Problem**: `401 Unauthorized`
- API key is missing or invalid. Verify: `echo $OPENAI_API_KEY | head -c 10` should show `sk-...`
- Check the key has Audio API access in your OpenAI dashboard

**Problem**: `413 Request Entity Too Large`
- OpenAI limits file uploads to 25 MB. Split large files:
  ```bash
  ffmpeg -i large_recording.mp3 -f segment -segment_time 600 -c copy segment_%03d.mp3
  ```

**Problem**: `429 Rate Limited`
- You are sending too many requests. Add delays between batch transcriptions.
- Check your OpenAI rate limits at platform.openai.com/account/rate-limits

## Installing sherpa-onnx-tts (Local TTS)

### Step 1: Download the runtime

The runtime is platform-specific. Downloads extract to `~/.openclaw/tools/sherpa-onnx-tts/runtime/`.

**macOS (Universal)**:
```bash
mkdir -p ~/.openclaw/tools/sherpa-onnx-tts/runtime
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.23/sherpa-onnx-v1.12.23-osx-universal2-shared.tar.bz2 \
  | tar xj --strip-components=1 -C ~/.openclaw/tools/sherpa-onnx-tts/runtime
```

**Linux x64**:
```bash
mkdir -p ~/.openclaw/tools/sherpa-onnx-tts/runtime
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.23/sherpa-onnx-v1.12.23-linux-x64-shared.tar.bz2 \
  | tar xj --strip-components=1 -C ~/.openclaw/tools/sherpa-onnx-tts/runtime
```

**Windows x64**:
```bash
mkdir -p ~/.openclaw/tools/sherpa-onnx-tts/runtime
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.23/sherpa-onnx-v1.12.23-win-x64-shared.tar.bz2 \
  | tar xj --strip-components=1 -C ~/.openclaw/tools/sherpa-onnx-tts/runtime
```

### Step 2: Download a voice model

The default recommended voice is Piper en_US lessac (high quality):

```bash
mkdir -p ~/.openclaw/tools/sherpa-onnx-tts/models
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-high.tar.bz2 \
  | tar xj -C ~/.openclaw/tools/sherpa-onnx-tts/models
```

Other voice options are available at the [sherpa-onnx tts-models releases](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models).

### Step 3: Configure OpenClaw

Add the environment variables to `~/.openclaw/openclaw.json`:

```json5
{
  skills: {
    entries: {
      "sherpa-onnx-tts": {
        env: {
          SHERPA_ONNX_RUNTIME_DIR: "~/.openclaw/tools/sherpa-onnx-tts/runtime",
          SHERPA_ONNX_MODEL_DIR: "~/.openclaw/tools/sherpa-onnx-tts/models/vits-piper-en_US-lessac-high",
        },
      },
    },
  },
}
```

### Step 4: Verify

```bash
# Generate a test audio file
skills/sherpa-onnx-tts/bin/sherpa-onnx-tts -o /tmp/tts-test.wav "Hello from local text to speech."

# Play it (macOS)
afplay /tmp/tts-test.wav

# Play it (Linux with aplay)
aplay /tmp/tts-test.wav
```

### Troubleshooting

**Problem**: `sherpa-onnx-tts: SHERPA_ONNX_RUNTIME_DIR not set`
- Ensure the env vars are set in the OpenClaw config (Step 3 above)
- Alternatively, export them in your shell profile:
  ```bash
  export SHERPA_ONNX_RUNTIME_DIR=~/.openclaw/tools/sherpa-onnx-tts/runtime
  export SHERPA_ONNX_MODEL_DIR=~/.openclaw/tools/sherpa-onnx-tts/models/vits-piper-en_US-lessac-high
  ```

**Problem**: `Error: Cannot find shared library` / dynamic linker errors
- The runtime shared libraries need to be findable:
  ```bash
  # macOS
  export DYLD_LIBRARY_PATH=~/.openclaw/tools/sherpa-onnx-tts/runtime/lib:$DYLD_LIBRARY_PATH

  # Linux
  export LD_LIBRARY_PATH=~/.openclaw/tools/sherpa-onnx-tts/runtime/lib:$LD_LIBRARY_PATH
  ```

**Problem**: `Error: Model file not found`
- Verify the model directory contains `.onnx` files:
  ```bash
  ls ~/.openclaw/tools/sherpa-onnx-tts/models/vits-piper-en_US-lessac-high/
  ```
- If there are multiple `.onnx` files, specify which one with `SHERPA_ONNX_MODEL_FILE` or `--model-file`

**Problem**: Audio output sounds robotic or distorted
- Try a different voice model. The `high` variants have better quality than `medium` or `low`
- Ensure the output sample rate matches your audio playback device

## Voice Call Setup with Twilio

### Prerequisites

- A Twilio account (twilio.com)
- A Twilio phone number with voice capability
- The voice-call plugin enabled in OpenClaw

### Step 1: Get Twilio credentials

From the [Twilio Console](https://console.twilio.com/):
1. Note your **Account SID** (starts with `AC`)
2. Note your **Auth Token**
3. Buy or note your **Twilio phone number** (E.164 format: `+15555550100`)

### Step 2: Configure OpenClaw

Edit `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          provider: "twilio",
          twilio: {
            accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            authToken: "your_auth_token_here",
          },
          fromNumber: "+15555550100",
        },
      },
    },
  },
}
```

Alternative providers:

**Telnyx**:
```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          provider: "telnyx",
          telnyx: {
            apiKey: "KEY_...",
            connectionId: "...",
          },
          fromNumber: "+15555550100",
        },
      },
    },
  },
}
```

**Plivo**:
```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          provider: "plivo",
          plivo: {
            authId: "...",
            authToken: "...",
          },
          fromNumber: "+15555550100",
        },
      },
    },
  },
}
```

**Mock (development/testing)**:
```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          provider: "mock",
        },
      },
    },
  },
}
```

### Step 3: Test the setup

```bash
# Check plugin status
openclaw voicecall status

# Make a test call (mock mode for safety)
openclaw voicecall call --to "+15555550123" --message "Hello from OpenClaw"
```

### Step 4: Configure webhook (for incoming calls)

Twilio needs a publicly accessible URL to send incoming call events to OpenClaw. Options:

1. **Tailscale Funnel** (recommended for personal use):
   ```json5
   {
     gateway: {
       tailscale: { mode: "funnel" },
     },
   }
   ```

2. **ngrok** (development):
   ```bash
   ngrok http 18789
   ```
   Set the ngrok URL as your Twilio webhook.

3. **Fly.io / Render** (production):
   Deploy OpenClaw to a cloud platform and use the public URL.

In the Twilio Console, set the Voice webhook URL for your phone number to:
```
https://your-openclaw-host/voice/twilio/incoming
```

### Troubleshooting

**Problem**: `voice-call plugin not enabled`
- Verify `plugins.entries.voice-call.enabled` is `true` in config
- Restart the gateway after config changes

**Problem**: `401 Unauthorized` from Twilio
- Verify Account SID and Auth Token are correct
- Check if the Auth Token was recently rotated in the Twilio Console

**Problem**: Calls connect but no audio
- Ensure both STT (whisper) and TTS (sherpa-onnx-tts) are installed and working
- Test each component independently first
- Check that the webhook URL is correct and accessible from the internet

**Problem**: `Number is not a valid phone number`
- Use E.164 format: `+` followed by country code and number, no spaces or dashes
- Example: `+15555550123`, not `555-555-0123`

## Full Voice Pipeline Verification

After installing all components, run this checklist:

```bash
# 1. STT check (local)
whisper --help >/dev/null 2>&1 && echo "whisper: OK" || echo "whisper: NOT FOUND"

# 2. STT check (API)
test -n "$OPENAI_API_KEY" && echo "openai-api-key: OK" || echo "openai-api-key: NOT SET"

# 3. TTS check
test -d "$SHERPA_ONNX_RUNTIME_DIR" && echo "sherpa-runtime: OK" || echo "sherpa-runtime: NOT FOUND"
test -d "$SHERPA_ONNX_MODEL_DIR" && echo "sherpa-model: OK" || echo "sherpa-model: NOT FOUND"

# 4. Voice-call check
openclaw voicecall status 2>/dev/null && echo "voice-call: OK" || echo "voice-call: NOT CONFIGURED"
```

Or use the skill-health skill:
```bash
python skills/skill-health/scripts/skill_health.py --skill voice-assistant
python skills/skill-health/scripts/skill_health.py --skill openai-whisper
python skills/skill-health/scripts/skill_health.py --skill sherpa-onnx-tts
python skills/skill-health/scripts/skill_health.py --skill voice-call
```
