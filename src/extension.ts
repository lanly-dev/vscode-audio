import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import LemonadeTreeDataProvider from './Treeview'
import { changeServerUrl } from './Config'
import { pickModel, transcribeAudio } from './Server'


export async function activate(context: vscode.ExtensionContext) {
  const rc = vscode.commands.registerCommand
  const lemonadeProvider = await createTreeViews()
  const d1 = rc('audio-lab.transcribeAudio', () => transcribeAudio(context))
  const d2 = rc('audio-lab.changeServerUrl', () => changeServerUrl(lemonadeProvider))
  const d3 = rc('audio-lab.pickModel', async (treeItem: { label: string }) => {
    const { label: modelId } = treeItem
    if (!modelId) {
      vscode.window.showInformationMessage('No model selected.')
      return
    }
    await pickModel(modelId, lemonadeProvider)
  })
  context.subscriptions.push(d1, d2, d3)
}

// Register tree view for Lemonade status
async function createTreeViews() {
  const lemonadeProvider = new LemonadeTreeDataProvider()
  vscode.window.createTreeView('lemonadeStatus', {
    treeDataProvider: lemonadeProvider,
    showCollapseAll: true
  })
  await lemonadeProvider.refreshStatus()
  return lemonadeProvider
}

//   // Register command to pick transcription model from available models
//   const pickModelDisposable = vscode.commands.registerCommand('audio-lab.pickTranscriptionModel', async (modelId?: string) => {
//     // If no modelId provided, show model picker
//     if (!modelId) {
//       if (availableModels.length === 0) {
//         await lemonadeProvider.refreshStatus()
//       }

//       if (availableModels.length === 0) {
//         vscode.window.showWarningMessage('No models available. Make sure the Lemonade server is running.')
//         return
//       }

//       // Get whisper models for selection
//       const whisperModels = availableModels.filter((m: any) => {
//         const id = (m.id || m.name || '').toLowerCase()
//         return id.includes('whisper') || id.includes('transcri') || id.includes('audio-lab')
//       })

//       if (whisperModels.length === 0) {
//         vscode.window.showWarningMessage('No transcription/whisper models found on the server.')
//         return
//       }

//       const quickPickItems = whisperModels.map((m: any) => ({
//         label: m.id || m.name,
//         description: m.id || m.name,
//         detail: loadedWhisperModel === (m.id || m.name) ? '(Currently loaded)' : '(Not loaded)'
//       }))

//       const selected = await vscode.window.showQuickPick(quickPickItems, {
//         placeHolder: 'Select a whisper/transcription model',
//         title: 'Transcription Model Selector'
//       })

//       if (selected) {
//         modelId = selected.description
//       } else {
//         return
//       }
//     }

//     if (modelId) {
//       selectedTranscriptionModel = modelId

//       // Save to workspace state
//       await context.workspaceState.update('transcriptionModel', modelId)

//       // Auto-load the selected model
//       try {
//         await loadModel(currentServerUrl, modelId)
//         loadedWhisperModel = modelId
//         await lemonadeProvider.refreshStatus()

//         vscode.window.showInformationMessage(`Transcription model set to: ${modelId} (loaded)`)
//       } catch (error) {
//         vscode.window.showErrorMessage(`Failed to load model: ${(error as Error).message}`)
//       }
//     }
//   })


//   // Register command to start Lemonade server
//   const startServerDisposable = vscode.commands.registerCommand('audio-lab.startLemonadeServer', async (serverUrl?: string) => {
//     const targetUrl = serverUrl || currentServerUrl

//     try {
//       vscode.window.showInformationMessage('Starting Lemonade server...')

//       // Try to start via the API if available
//       // Note: This is a placeholder - actual start mechanism depends on your setup
//       const response = await fetch(`${targetUrl}/start`, { method: 'POST' }).catch(() => null)

//       if (response && response.ok) {
//         vscode.window.showInformationMessage('Lemonade server started successfully')
//         await lemonadeProvider.refreshStatus()
//       } else {
//         // Alternative: Try to start via system command if configured
//         const config = vscode.workspace.getConfiguration('audio-lab')
//         const serverPath = config.get<string>('serverPath', '')

//         if (serverPath) {
//           // Use spawn for detaching processes properly
//           spawn(serverPath, [], { detached: true, stdio: 'ignore' })
//           vscode.window.showInformationMessage(`Starting Lemonade server from: ${serverPath}`)

//           // Wait and check if server started
//           setTimeout(async () => {
//             await lemonadeProvider.refreshStatus()
//           }, 3000)
//         } else {
//           vscode.window.showWarningMessage('No server path configured. Please set "audio-lab.serverPath" in settings.')
//         }
//       }
//     } catch (error) {
//       vscode.window.showErrorMessage(`Failed to start server: ${(error as Error).message}`)
//     }
//   })

//   // Register command to refresh Lemonade status
//   const refreshDisposable = vscode.commands.registerCommand('audio-lab.refreshLemonadeStatus', async () => {
//     await lemonadeProvider.refreshStatus()
//     vscode.window.showInformationMessage('Lemonade status refreshed')
//   })


//   // Register command to unload whisper model
//   const unloadWhisperDisposable = vscode.commands.registerCommand('audio-lab.unloadWhisperModel', async (modelId?: string) => {
//     if (!modelId || loadedWhisperModel !== modelId) {
//       // If no model or not the loaded one, get from state
//       modelId = loadedWhisperModel || undefined
//     }

//     if (modelId) {
//       try {
//         await unloadModel(currentServerUrl, modelId)
//         if (loadedWhisperModel === modelId) {
//           loadedWhisperModel = null
//         }
//         await lemonadeProvider.refreshStatus()
//         vscode.window.showInformationMessage(`Model unloaded: ${modelId}`)
//       } catch (error) {
//         vscode.window.showErrorMessage(`Failed to unload model: ${(error as Error).message}`)
//       }
//     }
//   })

//   // Register context menu for files in explorer - detect audio-lab files
//   const audio-labFileContextDisposable = vscode.commands.registerCommand('audio-lab.setContextForaudio-labFiles', async (node: any) => {
//     let uri: vscode.Uri

//     if (node && node.uri) {
//       uri = node.uri
//     } else if (vscode.window.activeTextEditor) {
//       uri = vscode.window.activeTextEditor.document.uri
//     } else {
//       return
//     }

//     const audio-labExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm']
//     const ext = uri.fsPath.split('.').pop()?.toLowerCase()

//     if (audio-labExtensions.includes(ext || '')) {
//       await context.workspaceState.update('lastSelectedFile', uri)
//       // Show status bar item to indicate file is selected for transcription
//       vscode.window.showInformationMessage(`audio-lab file selected for transcription: ${path.basename(uri.fsPath)}`)
//     }
//   })

//   // Listen for configuration changes to update server URL
//   const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
//     if (event.affectsConfiguration('audio-lab.lemonadeServerUrl')) {
//       await lemonadeProvider.refreshStatus()
//     }
//   })

//   context.subscriptions.push(
//     transcribeDisposable,
//     pickModelDisposable,
//     editServerUrlDisposable,
//     startServerDisposable,
//     stopServerDisposable,
//     refreshDisposable,
//     loadWhisperDisposable,
//     unloadWhisperDisposable,
//     audio-labFileContextDisposable,
//     configChangeDisposable
//   )

//   // Restore saved transcription model from workspace state
//   const savedModel = context.workspaceState.get<string>('transcriptionModel')
//   if (savedModel) {
//     selectedTranscriptionModel = savedModel
//   }

//   // Register the tree view visibility change handler to refresh when shown
//   lemonadeTreeView.onDidChangeVisibility(async () => {
//     if (lemonadeTreeView.visible) {
//       await lemonadeProvider.refreshStatus()
//     }
//   })
// }

// // This method is called when your extension is deactivated
// export function deactivate() {
//   // Cleanup if needed
//   console.log('audio-lab extension deactivated')
// }
