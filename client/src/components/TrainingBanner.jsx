import React from 'react';
import { isTrainingDatabase } from '../lib/database.js';

/**
 * A strip across the top of every page (website, registration, census, admin)
 * when the site isn't connected to the live registry: the training site and
 * local dev. It scrolls away with the page, so it never covers the sticky
 * headers. Not printed: print sheets render outside #root.
 */
export default function TrainingBanner() {
  if (!isTrainingDatabase(import.meta.env.VITE_SUPABASE_URL)) return null;
  return (
    <div role="note" className="bg-[#6d28d9] text-white text-[13px] font-semibold text-center px-4 py-1.5 leading-snug">
      Training site: practice data only. Nothing here changes the parish's real registry.
    </div>
  );
}
