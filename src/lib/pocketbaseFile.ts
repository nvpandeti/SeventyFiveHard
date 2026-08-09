const mimeByExt: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export function normalizePocketBaseFileName(fileUri: string, fallbackPrefix = 'file'): string {
  const rawFilename = fileUri.split('/').pop() ?? `${fallbackPrefix}-${Date.now()}.jpg`;
  const filename = rawFilename.split('?')[0].split('#')[0] || `${fallbackPrefix}-${Date.now()}.jpg`;
  return filename;
}

export function getPocketBaseMimeType(fileName: string): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? 'jpg' : 'jpg';
  return mimeByExt[ext.toLowerCase()] ?? 'image/jpeg';
}

export function createPocketBaseFilePart(fileUri: string, fallbackPrefix = 'file'): {
  uri: string;
  name: string;
  type: string;
} {
  const name = normalizePocketBaseFileName(fileUri, fallbackPrefix);
  return {
    uri: fileUri,
    name,
    type: getPocketBaseMimeType(name),
  };
}