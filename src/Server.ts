import * as vscode from 'vscode'
import path from 'path'
import fs from 'fs'

// Function to get Lemonade server status and available models
export async function getLemonadeStatus(): Promise<any> {
  const serverUrl = vscode.workspace.getConfiguration('audio-lab').get<string>('lemonadeServerUrl')
  try {
    let models: any[] = []
    const modelsResponse = await fetch(`${serverUrl}/v1/models`)

    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json()
      models = modelsData.data || []
    } else throw new Error(`Failed to fetch models: Server returned ${modelsResponse.status}`)

    return {
      models,
      url: serverUrl,
      rawData: { models: models },
      isRunning: true
    }
  } catch (error) {
    throw new Error(`Cannot connect to server: ${(error as Error).message}`)
  }
}

export async function loadModel(modelId: string): Promise<void> {
  const serverUrl = vscode.workspace.getConfiguration('audio-lab').get<string>('lemonadeServerUrl')
  try {
    const requestBody = { model_name: modelId }
    const response = await fetch(`${serverUrl}/api/v1/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) throw new Error(`Failed to load model: Server returned ${response.status}`)
    await response.json()
  } catch (error) {
    throw new Error(`Error loading model: ${(error as Error).message}`)
  }
}

// Function to unload a model from the Lemonade server
export async function unloadModel(serverUrl: string, modelId: string): Promise<void> {
  try {
    const requestBody = [modelId]
    const response = await fetch(`${serverUrl}/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) throw new Error(`Failed to unload model: Server returned ${response.status}`)

    await response.json()
  } catch (error) {
    throw new Error(`Error unloading model: ${(error as Error).message}`)
  }
}

export async function transcribeAudio(context: vscode.ExtensionContext) {
  let targetUri: vscode.Uri | undefined

  // First, try to get selected file from the explorer context menu
  const lastSelectedFile = context.workspaceState.get<vscode.Uri>('lastSelectedFile')
  if (lastSelectedFile) targetUri = lastSelectedFile

  // If no explorer selection, check active editor's document URI
  if (!targetUri && vscode.window.activeTextEditor) targetUri = vscode.window.activeTextEditor.document.uri

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
    if (files && files.length > 0) targetUri = files[0]
    else {
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
  const serverUrl = 'http://localhost:13305'
  const model = 'Whisper-Large-v3-Turbo'


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

    if (!response.ok) throw new Error(`Transcription failed: Server returned ${response.status}`)

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
                } else vscode.window.showErrorMessage('Transcription completed but no text returned')
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
      if (attempts >= maxAttempts) vscode.window.showWarningMessage(`Transcription still in progress. It may take a while for large files.`)
    })
  } catch (error) {
    console.error('Transcription error:', error)
    vscode.window.showErrorMessage(`Transcription failed: ${(error as Error).message}`)
  }
}
