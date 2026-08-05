// =============================================================================
// Client-side photo compression. Phone cameras produce 4–12 MB photos; sending
// those raw would chew mobile data and storage. Before any upload we redraw
// the image onto a canvas capped at ~1600px and re-encode as JPEG — visually
// identical for order/chat photos at roughly a tenth the size. If anything in
// the pipeline fails (odd formats, old browsers) the original file is used.
// =============================================================================
export async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    if (!/^image\//.test(file.type)) return file
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
