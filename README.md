# Audio Lab Extension
Transcribing audio files using the [Lemonade](https://lemonade-server.ai) server with Whisper models.
<a href="https://marketplace.visualstudio.com/items?itemName=lanly-dev.audio-lab" target="_blank">
  <img src='https://code.visualstudio.com/favicon.ico' width='13'/>
</a>
<a href="https://open-vsx.org/extension/lanly-dev/audio-lab" target="_blank">
  <img src='https://open-vsx.org/favicon.ico' width='12'/>
</a>

## Features
> A way to transcribe you audio without leaving your IDE.

## Quick Start

### 1. Configure Server URL
Set your Lemonade server URL in VS Code settings:
```json
{
  "audio-lab.lemonadeServerUrl": "http://localhost:13305"
}
```
Or use the command palette:
1. `Ctrl+Shift+P` → **AudioLab: Change Lemonade Server URL**
2. Enter your server URL

### 2. Open the Audio Lab View
Click the **AudioLab** icon in the Activity Bar.

### 3. Select a Model
- Expand the **Available Models** section
- Click on any Whisper model (installed in Lemonade) to select it for transcription
- Noted: Selected models appear with a green dot indicator

### 4. Transcribe an Audio File
**From the tree view:**
1. Expand **Audio Files** → navigate to your desired directory
2. Right-click (or click the action) on any audio file
3. Select **Transcribe Audio**

**From file picker:**
1. `Ctrl+Shift+P` → **AudioLab: Transcribe Audio From File Chooser**
2. Select an audio file

### 5. View Results
The transcription text opens in a new editor tab once processing completes.

## Supported Audio Formats
MP3, WAV, OGG, M4A, FLAC, AAC, WMA, WebM, Opus, AMR, AU, AIFF

## Extension Settings
- `audio-lab.lemonadeServerUrl`: URL of the running Lemonade server, default: `http://localhost:13305`
- `audio-lab.pickedModel`: Currently selected Whisper model ID for transcription, default: `null`

## Tree View Structure
```txt
AudioLab (Activity Bar)
└─Lemonade Server Status
  ├─https://your-server-url     [Server URL]
  ├─Status: ● Running           [Server status indicator]
  ├─Available Models (3)
  │ ├─whisper-large-v3t         [Selected - green dot]
  │ ├─whisper-large-v3          [Available - click to select]
  │ └─not-whisper-models        [Just for display]
  └─Audio Files
    ├─dir1/
    │ ├─demo.mp3
    │ └─recording.wav
    ├─dir2/
    │ └─interview.m4a
   ...
```

## Requirements
- Need Lemonade to be installed and running

## Release notes

### 1.0.0
Initial release of the extension

**Enjoy!**
