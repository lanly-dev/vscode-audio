import * as vscode from 'vscode'
import { getLemonadeStatus } from './Server'
import { TreeItem } from 'vscode'
import { isValidUrl, isWhisperModel, detectWhisperModel } from './Utils'

export default class LemonadeTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event

  private currentServerUrl: string
  private isServerRunning: boolean | null
  private serverStatusData: any
  private availableModels: any[] = []
  private loadedWhisperModel: string | null
  private getError: Error | null

  constructor() {
    const config = vscode.workspace.getConfiguration('audio')
    if (!config.get<string>('lemonadeServerUrl')) throw new Error('Lemonade server URL is not configured.')

    this.currentServerUrl = config.get<string>('lemonadeServerUrl')!
    this.isServerRunning = false
    this.serverStatusData = null
    this.availableModels = []
    this.loadedWhisperModel = null
    this.getError = null
  }

  async refreshStatus(): Promise<void> {
    this.currentServerUrl = vscode.workspace.getConfiguration('audio').get<string>('lemonadeServerUrl')!
    this.getError = null
    if (!isValidUrl(this.currentServerUrl)) {
      this.isServerRunning = null
      this.availableModels = []
      this._onDidChangeTreeData.fire()
      return
    }
    try {
      this.serverStatusData = await getLemonadeStatus(this.currentServerUrl)
    } catch (error) {
      this.getError = error as Error
      this._onDidChangeTreeData.fire()
      return
    }
    this.availableModels = this.serverStatusData.models || []
    this.isServerRunning = this.serverStatusData.isRunning !== false  // Use the isRunning flag we added

    // Detect whisper model for transcription
    this.loadedWhisperModel = detectWhisperModel(this.availableModels)
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (this.getError) {
      const errorItem = new vscode.TreeItem(`Error: ${this.getError.message}`, vscode.TreeItemCollapsibleState.None)
      errorItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
      return [errorItem as TreeItem]
    }
    if (!element) {
      // Root level items
      const items: TreeItem[] = []

      if (this.serverStatusData) {
        // Server URL item
        const urlItem = new vscode.TreeItem(
          `${this.serverStatusData.url}`,
          vscode.TreeItemCollapsibleState.None
        )
        urlItem.iconPath = new vscode.ThemeIcon('server')
        urlItem.tooltip = `Server URL: ${this.currentServerUrl}`
        urlItem.contextValue = 'LEMONADE_SERVER_URL'
        items.push(urlItem as TreeItem)

        // Status indicator
        const statusText = this.isServerRunning ? 'Running' : this.isServerRunning === false ? 'Stopped' : 'Unknown'
        const statusItem = new vscode.TreeItem(`Status: ${statusText}`, vscode.TreeItemCollapsibleState.None)
        const statusColor = this.isServerRunning
          ? 'charts.green'
          : this.isServerRunning === false ? 'charts.red' : 'charts.gray'
        statusItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(statusColor))
        items.push(statusItem as TreeItem)



        // Models section header
        if (this.availableModels.length > 0) {
          const label = `Available Models (${this.availableModels.length})`
          const modelsHeader = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded)
          modelsHeader.iconPath = new vscode.ThemeIcon('list-tree')
          modelsHeader.contextValue = 'MODELS_HEADER'
          items.push(modelsHeader as TreeItem)
        } else {
          const noModels = new vscode.TreeItem('No models available', vscode.TreeItemCollapsibleState.None)
          noModels.iconPath = new vscode.ThemeIcon('circle-filled')
          items.push(noModels as TreeItem)
        }
      } else {
        const loadingItem = new vscode.TreeItem('Loading status...', vscode.TreeItemCollapsibleState.None)
        loadingItem.iconPath = new vscode.ThemeIcon('loading~spin')
        items.push(loadingItem as TreeItem)
      }
      return items
    } else if (element.contextValue === 'MODELS_HEADER') return this.getModelChildren()
    return []
  }

  private getModelChildren(): TreeItem[] {
    const items: TreeItem[] = []

    for (const model of this.availableModels) {
      const modelId = model.id || model.name || 'Unknown'

      if (isWhisperModel(model)) {
        // Whisper model - show with start/stop and pick actions
        let label = `Whisper: ${modelId}`
        let tooltip = modelId

        if (this.loadedWhisperModel === modelId) {
          label += ' (Loaded)'
          tooltip = `${modelId} - Currently loaded\nClick to unload`

          const loadedItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
          loadedItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
          loadedItem.tooltip = tooltip
          loadedItem.contextValue = 'whisper-loaded'
          loadedItem.command = {
            command: 'audio.unloadWhisperModel',
            title: 'Unload Model',
            arguments: [modelId]
          }

          // Pick button as inline action
          const pickBtn = new vscode.TreeItem(
            '✓ Select',
            vscode.TreeItemCollapsibleState.None
          )
          pickBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
          pickBtn.command = {
            command: 'audio.pickTranscriptionModel',
            title: 'Select for Transcription',
            arguments: [modelId]
          }

          items.push(loadedItem as TreeItem)
          items.push(pickBtn as TreeItem)
        } else {
          tooltip = `${modelId}\nClick to load for transcription`

          const availableItem = new vscode.TreeItem(
            label,
            vscode.TreeItemCollapsibleState.None
          )
          availableItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#dcb67a'))
          availableItem.tooltip = tooltip
          availableItem.contextValue = 'whisper-available'
          availableItem.command = {
            command: 'audio.loadWhisperModel',
            title: 'Load Model',
            arguments: [modelId]
          }

          // Pick button as inline action
          const pickBtn = new vscode.TreeItem(
            '✓ Select',
            vscode.TreeItemCollapsibleState.None
          )
          pickBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#00f'))
          pickBtn.command = {
            command: 'audio.pickTranscriptionModel',
            title: 'Select for Transcription',
            arguments: [modelId]
          }

          items.push(availableItem as TreeItem)
          items.push(pickBtn as TreeItem)
        }
      } else {
        // Non-whisper model - no inline actions, just display
        const otherItem = new vscode.TreeItem(
          modelId,
          vscode.TreeItemCollapsibleState.None
        )
        otherItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#ccc'))
        items.push(otherItem as TreeItem)
      }
    }

    return items
  }
}
