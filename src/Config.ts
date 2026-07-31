import * as vscode from 'vscode'
import LemonadeTreeDataProvider from './Treeview'

export async function changeServerUrl(lemonadeProvider: LemonadeTreeDataProvider) {
  const currentUrl = vscode.workspace.getConfiguration('audio').get<string>('lemonadeServerUrl')
  const url = await vscode.window.showInputBox({
    prompt: 'Enter Lemonade server URL (include port)',
    value: currentUrl,
    placeHolder: 'http://localhost:13305',
    validateInput: (value) => {
      if (!value) return 'URL cannot be empty'
      try {
        new URL(value)
        return
      } catch {
        return 'Please enter a valid URL (include http:// or https://)'
      }
    }
  })

  if (!url) return
  const config = vscode.workspace.getConfiguration('audio')
  await config.update('lemonadeServerUrl', url)
  await lemonadeProvider.refreshStatus()
  vscode.window.showInformationMessage(`Server URL updated to: ${url}`)
}
