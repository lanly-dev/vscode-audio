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
    const uri = vscode.Uri.file(fullPath)
    vscode.commands.executeCommand('vscode.open', uri)
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

// This method is called when your extension is deactivated
export function deactivate() {
  console.info('AudioLab extension deactivated')
}
