import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { getLemonadeStatus } from './Server'
import { TreeItem } from 'vscode'
import { isValidUrl, isWhisperModel } from './Utils'

export default class LemonadeTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event

  private currentServerUrl: string
  private isServerRunning: boolean | null
  private serverStatusData: any
  private availableModels: any[] = []
  private pickedModel: string | null
  private getError: Error | null

  constructor() {
    const config = vscode.workspace.getConfiguration('audio-lab')
    if (!config.get<string>('lemonadeServerUrl')) throw new Error('Lemonade server URL is not configured.')

    this.getError = null
    this.availableModels = []
    this.isServerRunning = null
    this.serverStatusData = null
    this.currentServerUrl = config.get<string>('lemonadeServerUrl')!
    this.pickedModel = config.get<string>('pickedModel') ? config.get<string>('pickedModel')! : null
  }

  async refreshStatus(): Promise<void> {
    this.getError = null
    this.isServerRunning = null
    this.serverStatusData = null
    this.currentServerUrl = vscode.workspace.getConfiguration('audio-lab').get<string>('lemonadeServerUrl')!
    // Double check logic if the model got removed
    this.pickedModel = vscode.workspace.getConfiguration('audio-lab').get<string>('pickedModel')!
    this._onDidChangeTreeData.fire() // For the effect

    if (!isValidUrl(this.currentServerUrl)) {
      this.isServerRunning = null
      this.availableModels = []
      this._onDidChangeTreeData.fire()
      return
    }
    try {
      this.serverStatusData = await getLemonadeStatus()
    } catch (error) {
      this.getError = error as Error
      this._onDidChangeTreeData.fire()
      return
    }
    this.availableModels = this.serverStatusData.models || []
    this.isServerRunning = this.serverStatusData.isRunning !== false  // Use the isRunning flag we added

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

        const audioHeader = new vscode.TreeItem('Audio Files', vscode.TreeItemCollapsibleState.Expanded)
        audioHeader.iconPath = new vscode.ThemeIcon('music')
        audioHeader.contextValue = 'AUDIO_HEADER'
        items.push(audioHeader as TreeItem)

      } else {
        const loadingItem = new vscode.TreeItem('Loading status...', vscode.TreeItemCollapsibleState.None)
        loadingItem.iconPath = new vscode.ThemeIcon('loading~spin')
        items.push(loadingItem as TreeItem)
      }
      return items
    }
    else if (element.contextValue === 'MODELS_HEADER') return this.getModelChildren()
    else if (element.contextValue === 'AUDIO_HEADER') return this.getDirHasAudioChildren()
    else if (element.contextValue === 'AUDIO_DIRECTORY') return this.getAudioFilesChildren(element)
    return []
  }

  private getModelChildren(): TreeItem[] {
    const aModels: TreeItem[] = []
    const bModels: TreeItem[] = []

    for (const model of this.availableModels) {
      const modelId = model.id || model.name || 'Unknown'

      if (isWhisperModel(model)) {
        let label = modelId

        if (this.pickedModel === modelId) {
          const pickedItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
          pickedItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'))
          pickedItem.tooltip = modelId
          aModels.push(pickedItem as TreeItem)
        } else {
          const availableItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
          availableItem.iconPath = new vscode.ThemeIcon('circle-filled')
          availableItem.tooltip = modelId
          availableItem.contextValue = 'WHISPER_AVAILABLE'
          availableItem.command = {
            command: 'audio-lab.pickModel',
            title: 'Select Model for Transcription',
            arguments: [modelId]
          }
          aModels.push(availableItem as TreeItem)
        }
      } else {
        // Non-whisper model - no inline actions, just display
        const otherItem = new vscode.TreeItem(modelId, vscode.TreeItemCollapsibleState.None)
        otherItem.iconPath = new vscode.ThemeIcon('dash')
        bModels.push(otherItem as TreeItem)
      }
    }
    return [...aModels, ...bModels]
  }

  private getDirHasAudioChildren(): TreeItem[] {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm', 'opus', 'amr', 'au', 'aiff']
    const items: TreeItem[] = []
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) return [new vscode.TreeItem('No workspace opened', vscode.TreeItemCollapsibleState.None) as TreeItem]

    // Collect all directories that contain audio files (including nested subdirectories)
    const dirsWithAudio: Set<string> = new Set()
    for (const folder of workspaceFolders) this.collectDirsWithAudio(folder.uri.fsPath, audioExtensions, dirsWithAudio)

    if (dirsWithAudio.size === 0) return [new vscode.TreeItem('No audio files found', vscode.TreeItemCollapsibleState.None) as TreeItem]

    for (const dir of dirsWithAudio) {
      const fullPath = path.join(workspaceFolders[0].uri.fsPath, dir === '.' ? '' : dir)
      const dirItem = new vscode.TreeItem(dir === '.' ? '(root)' : dir, vscode.TreeItemCollapsibleState.Collapsed)
      dirItem.iconPath = new vscode.ThemeIcon('folder')
      dirItem.contextValue = 'AUDIO_DIRECTORY'
      dirItem.tooltip = fullPath
      items.push(dirItem as TreeItem)
    }
    return items
  }

  private collectDirsWithAudio(dirPath: string, audioExtensions: string[], result: Set<string>) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    let hasAudioInDir = false

    for (const entry of entries) {
      if (['node_modules', '.git', '.vscode', 'dist', 'build'].includes(entry.name)) continue

      const fullPath = path.join(dirPath, entry.name)
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''

      if (entry.isFile() && audioExtensions.includes(ext)) hasAudioInDir = true
      else if (entry.isDirectory()) this.collectDirsWithAudio(fullPath, audioExtensions, result)
    }

    // Add directory to result if it has audio files directly or in subdirs
    if (hasAudioInDir) {
      const relativeDir = path.relative(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        dirPath
      )
      result.add(relativeDir === '' ? '.' : relativeDir)
    }
  }

  private getAudioIcon(ext: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      mp3: 'piano',
      wav: 'piano',
      ogg: 'piano',
      m4a: 'piano',
      flac: 'piano',
      aac: 'piano',
      webm: 'piano',
      opus: 'piano'
    }
    const iconId = iconMap[ext] || 'file'
    return new vscode.ThemeIcon(iconId)
  }

  private getAudioFilesChildren(element: TreeItem): TreeItem[] {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm', 'opus', 'amr', 'au', 'aiff']
    const items: TreeItem[] = []

    // Get the directory path from the element's tooltip (stored by getDirHasAudioChildren)
    const dirPath = typeof element.tooltip === 'string' ? element.tooltip : ''
    if (!dirPath || !fs.existsSync(dirPath)) {
      const noFilesItem = new vscode.TreeItem('No audio files', vscode.TreeItemCollapsibleState.None)
      noFilesItem.iconPath = new vscode.ThemeIcon('info')
      return [noFilesItem as TreeItem]
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = entry.name.split('.').pop()?.toLowerCase() || ''
          if (!audioExtensions.includes(ext)) continue

          const fullPath = path.join(dirPath, entry.name)
          const fileItem = new vscode.TreeItem(entry.name, vscode.TreeItemCollapsibleState.None)
          fileItem.iconPath = this.getAudioIcon(ext)
          fileItem.contextValue = 'AUDIO_ITEM'
          fileItem.tooltip = fullPath
          fileItem.command = {
            command: 'audio-lab.openAudioFile',
            title: 'Open Audio File in Editor',
            arguments: [fullPath]
          }
          items.push(fileItem as TreeItem)
        }
      }
    } catch {
      console.error(`AudioLab: Failed to read directory: ${dirPath}`)
    }

    if (items.length === 0) return [new vscode.TreeItem('No audio files', vscode.TreeItemCollapsibleState.None) as TreeItem]
    return items
  }
}
