# Audio Transcription Extension

This is a VS Code extension that allows you to transcribe audio files using a Lemonade server with Whisper. Simply select an audio file and the extension will send it to your local Lemonade server for transcription.

## Features

- Transcribe audio files (mp3, wav, m4a, flac, aac)
- View transcriptions directly in VS Code
- Integration with local Lemonade server running Whisper
- Configurable Lemonade server URL

## Requirements

To use this extension, you need:
1. A Lemonade server with Whisper installed and running locally
2. Audio files to transcribe (mp3, wav, m4a, flac, aac)

## Model Selection

The extension uses the `whisper-1` model by default. If your Lemonade server supports other models, you can:

1. Check available models on your Lemonade server by making a request to its `/v1/models` endpoint
2. Configure the extension to use different models through the Lemonade server settings

Example command to check available models:
```
curl http://localhost:13305/v1/models
```

## Extension Settings

This extension contributes the following settings:

* `audio.lemonadeServerUrl`: URL of your Lemonade server with Whisper (default: http://localhost:8000)

## Extension Settings

This extension contributes the following settings:

* `audio.lemonadeServerUrl`: URL of your Lemonade server with Whisper (default: http://localhost:8000)

## How to Use

1. Start your Lemonade server with Whisper
2. Open VS Code and press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the command palette
3. Type "Transcribe Audio File" and select it
4. Choose an audio file from your system
5. The transcription will appear in a new editor window

## Known Issues

- The extension assumes a local Lemonade server is running and accessible
- Network issues may prevent successful transcription
- Large audio files may take longer to process

## Release Notes

### 1.0.0

Initial release of audio transcription extension

### 1.0.1

Added support for multiple audio formats

### 1.1.0

Implemented Lemonade server integration with Whisper

### 1.1.1

Improved error handling and user feedback

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
