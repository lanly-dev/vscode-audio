// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawn } from 'child_process'

// Track which model is currently selected for transcription
let selectedTranscriptionModel: string = 'whisper-1'
let loadedWhisperModel: string | null = null

// Server URL state for the tree view
let currentServerUrl: string = 'http://localhost:13305'
let serverStatusData: any = null
let availableModels: any[] = []
let isServerRunning: boolean = false

interface LemonadeStatusItem extends vscode.TreeItem {
  type: string
}

// Tree view provider for Lemonade server status
class LemonadeStatusTreeDataProvider implements vscode.TreeDataProvider<LemonadeStatusItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LemonadeStatusItem | undefined | null | void> = new vscode.EventEmitter<LemonadeStatusItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<LemonadeStatusItem | undefined | null | void> = this._onDidChangeTreeData.event

  constructor() {
    const config = vscode.workspace.getConfiguration('audio')
    currentServerUrl = config.get<string>('lemonadeServerUrl', 'http://localhost:13305')
  }

  updateServerUrl(): void {
    const config = vscode.workspace.getConfiguration('audio')
    currentServerUrl = config.get<string>('lemonadeServerUrl', 'http://localhost:13305')
  }

  async refreshStatus(): Promise<void> {
    try {
      if (!this.isValidUrl(currentServerUrl)) {
        serverStatusData = {
          status: 'invalid' as const,
          models: [],
          url: currentServerUrl,
          error: 'Invalid URL format'
        }
        isServerRunning = false
        this._onDidChangeTreeData.fire()
        return
      }

      serverStatusData = await getLemonadeStatus(currentServerUrl)
      availableModels = serverStatusData.models || []
      isServerRunning = serverStatusData.isRunning !== false  // Use the isRunning flag we added
      
      // Detect whisper model for transcription
      loadedWhisperModel = this.detectWhisperModel()
      this._onDidChangeTreeData.fire()
    } catch (error) {
      console.error('Error refreshing Lemonade status:', error)
      serverStatusData = {
        status: 'unreachable' as const,
        models: [],
        url: currentServerUrl,
        error: (error as Error).message || 'Unknown error'
      }
      isServerRunning = false
      availableModels = []
      this._onDidChangeTreeData.fire()
    }
  }

  getTreeItem(element: LemonadeStatusItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: LemonadeStatusItem): Promise<LemonadeStatusItem[]> {
    if (!element) {
      // Root level items
      const items: LemonadeStatusItem[] = []

      if (serverStatusData) {
        // Server URL item with edit action - click to open input box for port editing
        const urlItem = new vscode.TreeItem(
          `Server: ${serverStatusData.url}`,
          vscode.TreeItemCollapsibleState.None
        )
        urlItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
        urlItem.tooltip = currentServerUrl
        urlItem.command = {
          command: 'audio.editServerUrlInline',
          title: 'Edit Server URL (Click to Change Port)',
          arguments: [currentServerUrl]
        }
        items.push(urlItem as LemonadeStatusItem)

        // Status indicator
        const statusText = isServerRunning ? 'Running' : 'Stopped'
        const statusItem = new vscode.TreeItem(
          `Status: ${statusText}`,
          vscode.TreeItemCollapsibleState.None
        )
        statusItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(isServerRunning ? '#2ea200' : '#f97583'))
        items.push(statusItem as LemonadeStatusItem)

        // Start/Stop inline buttons for server
        if (serverStatusData.status !== 'invalid') {
          const stopBtn = new vscode.TreeItem(
            '⏹ Stop Server',
            vscode.TreeItemCollapsibleState.None
          )
          stopBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#fb8f3c'))
          stopBtn.command = {
            command: 'audio.stopLemonadeServer',
            title: 'Stop Lemonade Server',
            arguments: [currentServerUrl]
          }
          items.push(stopBtn as LemonadeStatusItem)

          if (isServerRunning) {
            const startBtn = new vscode.TreeItem(
              '▶ Start Server',
              vscode.TreeItemCollapsibleState.None
            )
            startBtn.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('#2ea200'))
            startBtn.command = {
              command: 'audio.startLemonadeServer',
              title: 'Start Lemonade Server',
              arguments: [currentServerUrl]
            }
            items.push(startBtn as LemonadeStatusItem)
          }
        }

        // Error if exists
        if (serverStatusData.error) {
          const errorItem = new vscode.TreeItem(
            `Error: ${serverStatusData.error}`,
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
        if (availableModels.length > 0) {
          const modelsHeader = new vscode.TreeItem(
            `Available Models (${availableModels.length})`,
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

    for (const model of availableModels) {
      const modelId = model.id || model.name || 'Unknown'
      
      // Check if this is a whisper/audio transcription model
      const isWhisperModel = this.isWhisperModel(model)

      if (isWhisperModel) {
        // Whisper model - show with start/stop and pick actions
        let label = `Whisper: ${modelId}`
        let tooltip = modelId
        let iconColor = 'gray'

        if (loadedWhisperModel === modelId) {
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
    for (const model of availableModels) {
      const id = (model.id || model.name || '').toLowerCase()
      if (id.includes('whisper') || id.includes('transcri')) {
        return model.id || model.name
      }
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

// Audio files tree view provider
class AudioFilesTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // Default audio extensions to look for
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm']
    const items: vscode.TreeItem[] = []

    if (!element) {
      // Root level - show all open editors with audio files
      for (const sheet of vscode.workspace.textDocuments) {
        const ext = sheet.fileName.split('.').pop()?.toLowerCase()
        if (ext && audioExtensions.includes(ext)) {
          const item = new vscode.TreeItem(path.basename(sheet.fileName), vscode.TreeItemCollapsibleState.None)
          item.iconPath = vscode.ThemeIcon.File
          items.push(item)
        }
      }

      // Also check current workspace folders for audio files
      for (const folder of vscode.workspace.workspaceFolders || []) {
        const files = await this.findAudioFiles(folder.uri.fsPath, audioExtensions)
        for (const file of files.slice(0, 10)) { // Limit to 10 files
          const item = new vscode.TreeItem(path.basename(file), vscode.TreeItemCollapsibleState.None)
          item.iconPath = vscode.ThemeIcon.File
          item.command = {
            command: 'audio.transcribeAudio',
            title: 'Transcribe Audio File',
            arguments: [file]
          }
          items.push(item)
        }
      }
    }

    return items
  }

  private async findAudioFiles(dir: string, extensions: string[]): Promise<string[]> {
    const results: string[] = []
    try {
      for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          results.push(...await this.findAudioFiles(path.join(dir, entry.name), extensions))
        } else {
          const ext = entry.name.split('.').pop()?.toLowerCase()
          if (ext && extensions.includes(ext)) {
            results.push(path.join(dir, entry.name))
          }
        }
      }
    } catch {}
    return results
  }
}

// Function to get Lemonade server status and available models
async function getLemonadeStatus(serverUrl: string): Promise<any> {
  try {
    // Try the OpenAI-compatible models endpoint first - this is the standard API
    let models: any[] = []
    let isRunning = false
    
    try {
      const modelsResponse = await fetch(`${serverUrl}/v1/models`)
      if (modelsResponse.ok) {
        // Check if response is actually JSON, not HTML (which would indicate an error page)
        const contentType = modelsResponse.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const modelsData = await modelsResponse.json()
          models = modelsData.data || []
          isRunning = true
        } else {
          // Response is not JSON (likely HTML error page), try /status endpoint
          throw new Error('Non-JSON response from /v1/models')
        }
      }
    } catch (e) {
      // If /v1/models fails, try /status endpoint as fallback
      console.log('/v1/models failed, trying /status endpoint...')
    }

    // Try /status endpoint if /v1/models didn't work
    if (!isRunning) {
      try {
        const statusResponse = await fetch(`${serverUrl}/status`)
        if (statusResponse.ok) {
          const contentType = statusResponse.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const statusData = await statusResponse.json()
            isRunning = statusData.status !== 'stopped' && 
                        statusData.status !== 'offline' && 
                        statusData.status !== 'error'
            return {
              status: statusData.status || (isRunning ? 'running' : 'unknown'),
              version: statusData.version || '',
              models: models,
              url: serverUrl,
              rawData: statusData,
              isRunning: isRunning
            }
          }
        }
      } catch (e) {
        console.log('/status also failed')
      }
    }

    // If we got models from /v1/models, the server is running
    if (isRunning && models.length > 0) {
      return {
        status: 'running',
        version: '',
        models: models,
        url: serverUrl,
        rawData: { models: models },
        isRunning: true
      }
    }

    // If we couldn't connect to anything, throw an error
    throw new Error('Cannot connect to server')
  } catch (error) {
    throw new Error(`Cannot connect to server: ${(error as Error).message}`)
  }
}

// Register tree view for Lemonade status
async function createTreeViews(context: vscode.ExtensionContext): Promise<{lemonadeProvider: LemonadeStatusTreeDataProvider, lemonadeTreeView: vscode.TreeView<LemonadeStatusItem>, audioFilesTreeView: vscode.TreeView<vscode.TreeItem>}> {
  const lemonadeProvider = new LemonadeStatusTreeDataProvider()
  const lemonadeTreeView = vscode.window.createTreeView('lemonadeStatus', {
    treeDataProvider: lemonadeProvider,
    showCollapseAll: true
  })
  
  // Initial refresh to load status - CRITICAL: must call after creating the TreeView
  await lemonadeProvider.refreshStatus()

  // Register tree view for audio files
  const audioFilesProvider = new AudioFilesTreeDataProvider()
  const audioFilesTreeView = vscode.window.createTreeView('audioFiles', {
    treeDataProvider: audioFilesProvider,
    showCollapseAll: true
  })

  return { lemonadeProvider, lemonadeTreeView, audioFilesTreeView }
}

// Function to load a model on the Lemonade server
async function loadModel(serverUrl: string, modelId: string): Promise<void> {
  try {
    const requestBody = [modelId]
    const response = await fetch(`${serverUrl}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Failed to load model: Server returned ${response.status}`)
    }

    await response.json()
  } catch (error) {
    throw new Error(`Error loading model: ${(error as Error).message}`)
  }
}

// Function to unload a model from the Lemonade server
async function unloadModel(serverUrl: string, modelId: string): Promise<void> {
  try {
    const requestBody = [modelId]
    const response = await fetch(`${serverUrl}/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Failed to unload model: Server returned ${response.status}`)
    }

    await response.json()
  } catch (error) {
    throw new Error(`Error unloading model: ${(error as Error).message}`)
  }
}

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "audio" is now active!')

  // Create tree views
  const { lemonadeProvider, lemonadeTreeView, audioFilesTreeView } = await createTreeViews(context)

  // Function to show Lemonade status in status bar (replaces webview)
  function showLemonadeStatus() {
    if (!serverStatusData) {
      vscode.window.showInformationMessage('No status data. Refreshing...')
      lemonadeProvider.refreshStatus()
      return
    }

    let message = `Lemonade Status: ${serverStatusData.status}`
    if (serverStatusData.status === 'running') {
      const modelCount = serverStatusData.models?.length || 0
      message += ` | Models: ${modelCount} | URL: ${serverStatusData.url}`
      
      // Show available models
      const modelList = (serverStatusData.models || [])
        .map((m: any) => m.id || m.name)
        .join(', ')
      if (modelList) {
        message += `\nModels: ${modelList}`
      }
    } else if (serverStatusData.status === 'unreachable') {
      message += `\nCannot connect to server at ${serverStatusData.url}\nError: ${serverStatusData.error}`
    } else if (serverStatusData.status === 'invalid') {
      message += `\nInvalid URL format: ${serverStatusData.url}`
    }

    vscode.window.showInformationMessage(message, 'Refresh').then(selection => {
      if (selection === 'Refresh') {
        lemonadeProvider.refreshStatus()
      }
    })
  }

  // Register transcription command - works with currently open editor file
  const transcribeDisposable = vscode.commands.registerCommand('audio.transcribeAudio', async () => {
    let targetUri: vscode.Uri | undefined
    
    // First, try to get selected file from the explorer context menu
    const lastSelectedFile = context.workspaceState.get<vscode.Uri>('lastSelectedFile')
    if (lastSelectedFile) {
      targetUri = lastSelectedFile
    }
    
    // If no explorer selection, check active editor's document URI
    if (!targetUri && vscode.window.activeTextEditor) {
      targetUri = vscode.window.activeTextEditor.document.uri
    }
    
    // If still nothing, prompt user to pick a file from the explorer
    if (!targetUri) {
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Audio Files': ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm']
        }
      })
      if (files && files.length > 0) {
        targetUri = files[0]
      } else {
        vscode.window.showWarningMessage('No audio file selected. Please open or select an audio file first.')
        return
      }
    }

    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm']
    const ext = targetUri.fsPath.split('.').pop()?.toLowerCase()
    if (!audioExtensions.includes(ext || '')) {
      vscode.window.showWarningMessage('Selected file is not an audio file. Please select an audio file.')
      return
    }

    const fileName = path.basename(targetUri.fsPath)
    const serverUrl = currentServerUrl || 'http://localhost:13305'
    const model = selectedTranscriptionModel

    try {
      vscode.window.showInformationMessage(`Transcribing ${fileName} using ${model}...`)

      // Read the audio file content
      const audioBuffer = await fs.promises.readFile(targetUri.fsPath)

      // Send transcription request
      const formData = new FormData()
      formData.append('file', new Blob([audioBuffer]), fileName)
      formData.append('model', model)
      formData.append('upload_path', '/uploads/')
      formData.append('return_url', '/api/transcribe-status')

      const response = await fetch(`${serverUrl}/api/v1/audio/transcriptions`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Transcription failed: Server returned ${response.status}`)
      }

      // Parse response to check if text was returned directly or if we need to poll for progress
      const responseData = await response.json().catch(() => null)

      // Check if response includes text directly or if we need to poll for progress
      if (responseData && responseData.text) {
        // Direct text response - show immediately
        const doc = await vscode.workspace.openTextDocument({
          content: responseData.text
        })
        await vscode.window.showTextDocument(doc)
        
        vscode.window.showInformationMessage(`Transcription complete for ${fileName}`)
        return
      }

      // No direct text - poll for transcription progress via the status endpoint
      const taskId = responseData?.task_id || responseData?.id || responseData?.taskId
      const statusUrl = responseData?.status_url || responseData?.return_url || '/api/transcribe-status'
      
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Transcribing ${fileName}...`,
        cancellable: true
      }, async (progress, cancellationToken) => {
        let attempts = 0
        const maxAttempts = 300 // 5 minutes at 1 second intervals
        let lastProgress = ''

        while (attempts < maxAttempts && !cancellationToken.isCancellationRequested) {
          attempts++
          
          try {
            const statusResponse = await fetch(
              `${serverUrl}${statusUrl}`.replace('//', '/'),
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              }
            ).catch(() => null)

            if (statusResponse && statusResponse.ok) {
              const statusData = await statusResponse.json().catch(() => null)
              
              if (statusData) {
                // Update progress based on status field
                const taskStatus = statusData.status || statusData.state || ''
                const progressPercent = statusData.progress || statusData.percent || 0
                
                // Update notification progress
                progress.report({ 
                  message: `${taskStatus} - ${Math.round(progressPercent * 100)}%`,
                  increment: progressPercent / maxAttempts * 100 
                })

                lastProgress = taskStatus

                // If transcription is complete
                if (taskStatus === 'completed' || taskStatus === 'done' || taskStatus === 'success' || statusData.text) {
                  const transcriptText = statusData.text || responseData?.text || ''
                  if (transcriptText) {
                    const doc = await vscode.workspace.openTextDocument({
                      content: transcriptText
                    })
                    await vscode.window.showTextDocument(doc)
                    vscode.window.showInformationMessage(`Transcription complete for ${fileName}`)
                  } else {
                    vscode.window.showErrorMessage('Transcription completed but no text returned')
                  }
                  return
                }

                // If transcription failed
                if (taskStatus === 'error' || taskStatus === 'failed' || statusData.error) {
                  const errorMsg = statusData.error || statusData.message || 'Unknown error'
                  vscode.window.showErrorMessage(`Transcription failed: ${errorMsg}`)
                  return
                }
              }
            }

            // Wait before next poll (use 500ms for progress, faster response)
            await new Promise(resolve => setTimeout(resolve, 500))
          } catch (error) {
            console.error('Progress poll error:', error)
            progress.report({ message: `Checking status... (${attempts}s)` })
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }

        // Timeout
        if (attempts >= maxAttempts) {
          vscode.window.showWarningMessage(`Transcription still in progress. It may take a while for large files.`)
        }
      })
    } catch (error) {
      console.error('Transcription error:', error)
      vscode.window.showErrorMessage(`Transcription failed: ${(error as Error).message}`)
    }
  })

  // Register command to pick transcription model from available models
  const pickModelDisposable = vscode.commands.registerCommand('audio.pickTranscriptionModel', async (modelId?: string) => {
    // If no modelId provided, show model picker
    if (!modelId) {
      if (availableModels.length === 0) {
        await lemonadeProvider.refreshStatus()
      }

      if (availableModels.length === 0) {
        vscode.window.showWarningMessage('No models available. Make sure the Lemonade server is running.')
        return
      }

      // Get whisper models for selection
      const whisperModels = availableModels.filter((m: any) => {
        const id = (m.id || m.name || '').toLowerCase()
        return id.includes('whisper') || id.includes('transcri') || id.includes('audio')
      })

      if (whisperModels.length === 0) {
        vscode.window.showWarningMessage('No transcription/whisper models found on the server.')
        return
      }

      const quickPickItems = whisperModels.map((m: any) => ({
        label: m.id || m.name,
        description: m.id || m.name,
        detail: loadedWhisperModel === (m.id || m.name) ? '(Currently loaded)' : '(Not loaded)'
      }))

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a whisper/transcription model',
        title: 'Transcription Model Selector'
      })

      if (selected) {
        modelId = selected.description
      } else {
        return
      }
    }

    if (modelId) {
      selectedTranscriptionModel = modelId
      
      // Save to workspace state
      await context.workspaceState.update('transcriptionModel', modelId)
      
      // Auto-load the selected model
      try {
        await loadModel(currentServerUrl, modelId)
        loadedWhisperModel = modelId
        await lemonadeProvider.refreshStatus()
        
        vscode.window.showInformationMessage(`Transcription model set to: ${modelId} (loaded)`)
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load model: ${(error as Error).message}`)
      }
    }
  })

  // Register command to edit server URL inline (via quick input)
  const editServerUrlDisposable = vscode.commands.registerCommand('audio.editServerUrlInline', async (currentUrl?: string) => {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter Lemonade server URL (include port)',
      value: currentUrl || currentServerUrl,
      placeHolder: 'http://localhost:13305',
      validateInput: (value) => {
        if (!value) {
          return 'URL cannot be empty'
        }
        try {
          new URL(value)
          return null
        } catch {
          return 'Please enter a valid URL (include http:// or https://)'
        }
      }
    })

    if (url) {
      // Update configuration
      const config = vscode.workspace.getConfiguration('audio')
      await config.update('lemonadeServerUrl', url, vscode.ConfigurationTarget.Global)
      
      currentServerUrl = url
      
      // Refresh tree view
      await lemonadeProvider.refreshStatus()
      
      vscode.window.showInformationMessage(`Server URL updated to: ${url}`)
    }
  })

  // Register command to start Lemonade server
  const startServerDisposable = vscode.commands.registerCommand('audio.startLemonadeServer', async (serverUrl?: string) => {
    const targetUrl = serverUrl || currentServerUrl
    
    try {
      vscode.window.showInformationMessage('Starting Lemonade server...')
      
      // Try to start via the API if available
      // Note: This is a placeholder - actual start mechanism depends on your setup
      const response = await fetch(`${targetUrl}/start`, { method: 'POST' }).catch(() => null)
      
      if (response && response.ok) {
        vscode.window.showInformationMessage('Lemonade server started successfully')
        await lemonadeProvider.refreshStatus()
      } else {
        // Alternative: Try to start via system command if configured
        const config = vscode.workspace.getConfiguration('audio')
        const serverPath = config.get<string>('serverPath', '')
        
        if (serverPath) {
          // Use spawn for detaching processes properly
          spawn(serverPath, [], { detached: true, stdio: 'ignore' })
          vscode.window.showInformationMessage(`Starting Lemonade server from: ${serverPath}`)
          
          // Wait and check if server started
          setTimeout(async () => {
            await lemonadeProvider.refreshStatus()
          }, 3000)
        } else {
          vscode.window.showWarningMessage('No server path configured. Please set "audio.serverPath" in settings.')
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start server: ${(error as Error).message}`)
    }
  })

  // Register command to stop Lemonade server
  const stopServerDisposable = vscode.commands.registerCommand('audio.stopLemonadeServer', async (serverUrl?: string) => {
    const targetUrl = serverUrl || currentServerUrl
    
    try {
      vscode.window.showInformationMessage('Stopping Lemonade server...')
      
      const response = await fetch(`${targetUrl}/stop`, { method: 'POST' }).catch(() => null)
      
      if (response && response.ok) {
        vscode.window.showInformationMessage('Lemonade server stopped successfully')
        await lemonadeProvider.refreshStatus()
      } else {
        vscode.window.showWarningMessage('Could not stop server via API. You may need to stop it manually.')
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to stop server: ${(error as Error).message}`)
    }
  })

  // Register command to refresh Lemonade status
  const refreshDisposable = vscode.commands.registerCommand('audio.refreshLemonadeStatus', async () => {
    await lemonadeProvider.refreshStatus()
    vscode.window.showInformationMessage('Lemonade status refreshed')
  })

  // Register command to load whisper model
  const loadWhisperDisposable = vscode.commands.registerCommand('audio.loadWhisperModel', async (modelId?: string) => {
    if (!modelId) {
      if (availableModels.length === 0) {
        await lemonadeProvider.refreshStatus()
      }

      const whisperModels = availableModels.filter((m: any) => {
        const id = (m.id || m.name || '').toLowerCase()
        return id.includes('whisper') || id.includes('transcri')
      })

      if (whisperModels.length === 0) {
        vscode.window.showWarningMessage('No whisper models available.')
        return
      }

      const quickPickItems = whisperModels.map((m: any) => ({
        label: m.id || m.name,
        description: m.id || m.name
      }))

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a model to load'
      })

      if (selected) {
        modelId = selected.description
      } else {
        return
      }
    }

    if (modelId) {
      try {
        await loadModel(currentServerUrl, modelId)
        loadedWhisperModel = modelId
        await lemonadeProvider.refreshStatus()
        vscode.window.showInformationMessage(`Model loaded: ${modelId}`)
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load model: ${(error as Error).message}`)
      }
    }
  })

  // Register command to unload whisper model
  const unloadWhisperDisposable = vscode.commands.registerCommand('audio.unloadWhisperModel', async (modelId?: string) => {
  if (!modelId || loadedWhisperModel !== modelId) {
      // If no model or not the loaded one, get from state
      modelId = loadedWhisperModel || undefined
    }

    if (modelId) {
      try {
        await unloadModel(currentServerUrl, modelId)
        if (loadedWhisperModel === modelId) {
          loadedWhisperModel = null
        }
        await lemonadeProvider.refreshStatus()
        vscode.window.showInformationMessage(`Model unloaded: ${modelId}`)
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to unload model: ${(error as Error).message}`)
      }
    }
  })

  // Register context menu for files in explorer - detect audio files
  const audioFileContextDisposable = vscode.commands.registerCommand('audio.setContextForAudioFiles', async (node: any) => {
    let uri: vscode.Uri
    
    if (node && node.uri) {
      uri = node.uri
    } else if (vscode.window.activeTextEditor) {
      uri = vscode.window.activeTextEditor.document.uri
    } else {
      return
    }

    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'webm']
    const ext = uri.fsPath.split('.').pop()?.toLowerCase()
    
    if (audioExtensions.includes(ext || '')) {
      await context.workspaceState.update('lastSelectedFile', uri)
      // Show status bar item to indicate file is selected for transcription
      vscode.window.showInformationMessage(`Audio file selected for transcription: ${path.basename(uri.fsPath)}`)
    }
  })

  // Listen for configuration changes to update server URL
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration('audio.lemonadeServerUrl')) {
      await lemonadeProvider.refreshStatus()
    }
  })

  context.subscriptions.push(
    transcribeDisposable,
    pickModelDisposable,
    editServerUrlDisposable,
    startServerDisposable,
    stopServerDisposable,
    refreshDisposable,
    loadWhisperDisposable,
    unloadWhisperDisposable,
    audioFileContextDisposable,
    configChangeDisposable
  )

  // Restore saved transcription model from workspace state
  const savedModel = context.workspaceState.get<string>('transcriptionModel')
  if (savedModel) {
    selectedTranscriptionModel = savedModel
  }

  // Register the tree view visibility change handler to refresh when shown
  lemonadeTreeView.onDidChangeVisibility(async () => {
    if (lemonadeTreeView.visible) {
      await lemonadeProvider.refreshStatus()
    }
  })
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Cleanup if needed
  console.log('Audio extension deactivated')
}