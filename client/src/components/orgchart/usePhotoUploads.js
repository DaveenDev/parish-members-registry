import { useCallback, useRef, useState } from 'react';
import { api } from '../../api.js';

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Holder photos for the Organization Structure (R2, folder org/). Photos
 * uploaded here and never saved are taken back off R2 by `forget`, so
 * discarding an edit leaves nothing behind.
 */
export function usePhotoUploads() {
  const [uploading, setUploading] = useState(false);
  const added = useRef(new Set());

  const upload = useCallback(async (file) => {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
    if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
    setUploading(true);
    try {
      const url = await api.uploadImage(file, 'org');
      added.current.add(url);
      return url;
    } finally {
      setUploading(false);
    }
  }, []);

  /** A photo taken off before it was ever saved: delete it now. */
  const drop = useCallback((url) => {
    if (url && added.current.delete(url)) api.deleteImage(url).catch(() => {});
  }, []);

  /** Delete every photo uploaded here except those in `keep` (the ones now saved). */
  const forget = useCallback((keep = []) => {
    const kept = new Set(keep.filter(Boolean));
    for (const url of added.current) if (!kept.has(url)) api.deleteImage(url).catch(() => {});
    added.current.clear();
  }, []);

  return { uploading, upload, drop, forget };
}
