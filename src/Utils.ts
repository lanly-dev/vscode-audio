import * as vscode from 'vscode'

export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function isWhisperModel(model: any): boolean {
  const id = (model.id || model.name || '').toLowerCase()
  return id.includes('whisper') || id.includes('audio')
}

export async function showTheTranscript(fileName: string, transcribedText: string) {
  // Sanitize the file name by replacing spaces and invalid characters
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_\-]/g, '_')
  const dynamicTitle = `Transcript_${sanitizedFileName}.txt`

  const uri = vscode.Uri.parse(`untitled:${dynamicTitle}`)
  const doc = await vscode.workspace.openTextDocument(uri)
  const editor = await vscode.window.showTextDocument(doc)

  await editor.edit(editBuilder => editBuilder.insert(new vscode.Position(0, 0), transcribedText))
}
