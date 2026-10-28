// Shrinking photos in the browser before they're saved, so a 12 MB phone
// photo becomes a few hundred KB. Used for the parish photo (stored inline)
// and Blog Article photos (uploaded to R2).

function drawScaled(file, maxWidth, maxHeight = Infinity) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
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

/**
 * The logo at most `size` px on its longest side, as a data URL: PNG when the
 * upload is one (it may have a clear background), else JPEG. It shows at
 * 96 px at most, so 256 px stays sharp on any screen while a 500 KB upload
 * becomes a few dozen KB on every page.
 */
export async function resizeLogo(file, size = 256) {
  const canvas = await drawScaled(file, size, size);
  return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
}

/** The photo at most `maxWidth` wide, as a JPEG Blob ready to upload. */
export async function resizePhotoBlob(file, { maxWidth = 2000, quality = 0.85 } = {}) {
  const canvas = await drawScaled(file, maxWidth);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare that image'))), 'image/jpeg', quality));
}
