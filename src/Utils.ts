export function isWhisperModel(model: any): boolean {
  const id = (model.id || model.name || '').toLowerCase()
  return id.includes('whisper') || id.includes('transcri') || id.includes('audio')
}

export function detectWhisperModel(availableModels: any[]): string | null {
  for (const model of availableModels) {
    const id = (model.id || model.name || '').toLowerCase()
    if (id.includes('whisper') || id.includes('transcri')) return model.id || model.name
  }
  return null
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
