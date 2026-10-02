// Shrinking photos in the browser before they're saved, so a 12 MB phone
// photo becomes a few hundred KB. Used for the parish photo (stored inline)
// and Blog Article photos (uploaded to R2).

function drawScaled(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

/** The photo at most `maxWidth` wide, as a JPEG data URL. */
export async function resizePhoto(file, { maxWidth = 1920, quality = 0.82 } = {}) {
  return (await drawScaled(file, maxWidth)).toDataURL('image/jpeg', quality);
}

/** The photo at most `maxWidth` wide, as a JPEG Blob ready to upload. */
export async function resizePhotoBlob(file, { maxWidth = 2000, quality = 0.85 } = {}) {
  const canvas = await drawScaled(file, maxWidth);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare that image'))), 'image/jpeg', quality));
}
