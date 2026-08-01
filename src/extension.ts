import * as vscode from 'vscode'
import LemonadeTreeDataProvider from './Treeview'
import { changeServerUrl } from './Config'
import { pickModel, transcribeAudio } from './Server'


export async function activate(context: vscode.ExtensionContext) {
  const rc = vscode.commands.registerCommand
  const lemonadeProvider = await createTreeViews()
  const d1a = rc('audio-lab.transcribeAudioFile', () => transcribeAudio())
  const d1b = rc('audio-lab.transcribeAudioItem', (item: vscode.TreeItem) => transcribeAudio(item.tooltip?.toString()))
  const d2 = rc('audio-lab.changeServerUrl', () => changeServerUrl(lemonadeProvider))
  const d3 = rc('audio-lab.pickModel', async (modelId: string) => {
    if (!modelId) {
      vscode.window.showInformationMessage('No model selected.')
      return
    }
    await pickModel(modelId, lemonadeProvider)
  })
  const d4 = rc('audio-lab.openAudioFile', (fullPath: string) => {
    return lemonadeProvider.openAudioItem(fullPath)
  })

  const d5 = rc('audio-lab.revealInExplorer', (item: vscode.TreeItem) => {
    if (!item.tooltip) return
    const uri = vscode.Uri.file(item.tooltip.toString())
    vscode.commands.executeCommand('revealFileInOS', uri)
  })
  context.subscriptions.push(d1a, d1b, d2, d3, d4, d5)
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

// This method is called when your extension is deactivated
export function deactivate() {
  console.info('audio-lab extension deactivated')
}
