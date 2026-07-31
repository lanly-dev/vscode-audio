import * as vscode from 'vscode'
import { getLemonadeStatus } from './Server'

interface LemonadeStatusItem extends vscode.TreeItem {
  type: string
}

export default class LemonadeStatusTreeDataProvider implements vscode.TreeDataProvider<any> {
  private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>()
  readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event
  private currentServerUrl: string = 'http://localhost:13305'
  private isServerRunning: boolean = false
  private serverStatusData: any = null
  private availableModels: any[] = []
  private loadedWhisperModel: string | null = null


  constructor() {
    const config = vscode.workspace.getConfiguration('audio')
    this.currentServerUrl = config.get<string>('lemonadeServerUrl', 'http://localhost:13305')
  }

  updateServerUrl(): void {
    const config = vscode.workspace.getConfiguration('audio')
    this.currentServerUrl = config.get<string>('lemonadeServerUrl', 'http://localhost:13305')
  }

  async refreshStatus(): Promise<void> {
    try {
      if (!this.isValidUrl(this.currentServerUrl)) {
        this.serverStatusData = {
          status: 'invalid' as const,
          models: [],
          url: this.currentServerUrl,
          error: 'Invalid URL format'
        }
        this.isServerRunning = false
        this._onDidChangeTreeData.fire('test')
        return
      }

      this.serverStatusData = await getLemonadeStatus(this.currentServerUrl)
      this.availableModels = this.serverStatusData.models || []
      this.isServerRunning = this.serverStatusData.isRunning !== false  // Use the isRunning flag we added

      // Detect whisper model for transcription
      this.loadedWhisperModel = this.detectWhisperModel()
      this._onDidChangeTreeData.fire(void 0)
    } catch (error) {
      console.error('Error refreshing Lemonade status:', error)
      this.serverStatusData = {
        status: 'unreachable' as const,
        models: [],
        url: this.currentServerUrl,
        error: (error as Error).message || 'Unknown error'
      }
      this.isServerRunning = false
      this.availableModels = []
      this._onDidChangeTreeData.fire('test')
    }
  }

  getTreeItem(element: LemonadeStatusItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: LemonadeStatusItem): Promise<LemonadeStatusItem[]> {
    if (!element) {
      // Root level items
      const items: LemonadeStatusItem[] = []

      if (this.serverStatusData) {
        // Server URL item with edit action - click to open input box for port editing
        const urlItem = new vscode.TreeItem(
          `Server: ${this.serverStatusData.url}`,
          vscode.TreeItemCollapsibleState.None
        )
        urlItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
        urlItem.tooltip = this.currentServerUrl
        urlItem.command = {
          command: 'audio.editServerUrlInline',
          title: 'Edit Server URL (Click to Change Port)',
          arguments: [this.currentServerUrl]
        }
        items.push(urlItem as LemonadeStatusItem)

        // Status indicator
        const statusText = this.isServerRunning ? 'Running' : 'Stopped'
        const statusItem = new vscode.TreeItem(
          `Status: ${statusText}`,
          vscode.TreeItemCollapsibleState.None
        )
        statusItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(this.isServerRunning ? '#2ea200' : '#f97583'))
        items.push(statusItem as LemonadeStatusItem)

        // Start/Stop inline buttons for server
        if (this.serverStatusData.status !== 'invalid') {
          const stopBtn = new vscode.TreeItem(
            '⏹ Stop Server',
            vscode.TreeItemCollapsibleState.None
          )
          stopBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#fb8f3c'))
          stopBtn.command = {
            command: 'audio.stopLemonadeServer',
            title: 'Stop Lemonade Server',
            arguments: [this.currentServerUrl]
          }
          items.push(stopBtn as LemonadeStatusItem)

          if (this.isServerRunning) {
            const startBtn = new vscode.TreeItem(
              '▶ Start Server',
              vscode.TreeItemCollapsibleState.None
            )
            startBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
            startBtn.command = {
              command: 'audio.startLemonadeServer',
              title: 'Start Lemonade Server',
              arguments: [this.currentServerUrl]
            }
            items.push(startBtn as LemonadeStatusItem)
          }
        }

        // Error if exists
        if (this.serverStatusData.error) {
          const errorItem = new vscode.TreeItem(
            `Error: ${this.serverStatusData.error}`,
            vscode.TreeItemCollapsibleState.None
          )
          errorItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#f97583'))
          items.push(errorItem as LemonadeStatusItem)
        }

        // Add refresh command
        const refreshItem = new vscode.TreeItem(
          'Refresh Status',
          vscode.TreeItemCollapsibleState.None
        )
        refreshItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
        refreshItem.command = {
          command: 'audio.refreshLemonadeStatus',
          title: 'Refresh Status'
        }
        items.push(refreshItem as LemonadeStatusItem)

        // Models section header
        if (this.availableModels.length > 0) {
          const modelsHeader = new vscode.TreeItem(
            `Available Models (${this.availableModels.length})`,
            vscode.TreeItemCollapsibleState.Expanded
          )
          modelsHeader.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
          modelsHeader.contextValue = 'models-header'
          items.push(modelsHeader as LemonadeStatusItem)
        } else {
          const noModels = new vscode.TreeItem(
            'No models available',
            vscode.TreeItemCollapsibleState.None
          )
          noModels.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#808080'))
          items.push(noModels as LemonadeStatusItem)
        }
      } else {
        const loadingItem = new vscode.TreeItem(
          'Loading status...',
          vscode.TreeItemCollapsibleState.None
        )
        loadingItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#808080'))
        items.push(loadingItem as LemonadeStatusItem)
      }

      return items
    } else if (element.contextValue === 'models-header') {
      // Return models as children
      return this.getModelChildren()
    }
    return []
  }

  private getModelChildren(): LemonadeStatusItem[] {
    const items: LemonadeStatusItem[] = []

    for (const model of this.availableModels) {
      const modelId = model.id || model.name || 'Unknown'

      // Check if this is a whisper/audio transcription model
      const isWhisperModel = this.isWhisperModel(model)

      if (isWhisperModel) {
        // Whisper model - show with start/stop and pick actions
        let label = `Whisper: ${modelId}`
        let tooltip = modelId
        let iconColor = 'gray'

        if (this.loadedWhisperModel === modelId) {
          label += ' (Loaded)'
          tooltip = `${modelId} - Currently loaded\nClick to unload`
          iconColor = 'green'

          const loadedItem = new vscode.TreeItem(
            label,
            vscode.TreeItemCollapsibleState.None
          )
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

          items.push(loadedItem as LemonadeStatusItem)
          items.push(pickBtn as LemonadeStatusItem)
        } else {
          tooltip = `${modelId}\nClick to load for transcription`
          iconColor = 'yellow'

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
          pickBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#0a84ff'))
          pickBtn.command = {
            command: 'audio.pickTranscriptionModel',
            title: 'Select for Transcription',
            arguments: [modelId]
          }

          items.push(availableItem as LemonadeStatusItem)
          items.push(pickBtn as LemonadeStatusItem)
        }
      } else {
        // Non-whisper model - no inline actions, just display
        const otherItem = new vscode.TreeItem(
          modelId,
          vscode.TreeItemCollapsibleState.None
        )
        otherItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#808080'))
        items.push(otherItem as LemonadeStatusItem)
      }
    }

    return items
  }

  private isWhisperModel(model: any): boolean {
    const id = (model.id || model.name || '').toLowerCase()
    return id.includes('whisper') || id.includes('transcri') || id.includes('audio')
  }

  private detectWhisperModel(): string | null {
    for (const model of this.availableModels) {
      const id = (model.id || model.name || '').toLowerCase()
      if (id.includes('whisper') || id.includes('transcri')) return model.id || model.name
    }
    return null
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }
}
