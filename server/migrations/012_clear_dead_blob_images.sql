-- =============================================================================
-- Migration: 012_clear_dead_blob_images
-- Description: Before the import fix, a failed upload fell back to a browser
--              blob: URL that was saved as the context's current image. Those
--              URLs only existed in one browser tab and can never load again;
--              clearing them lets the workspace prompt for the image instead
--              of showing a broken canvas.
-- =============================================================================

UPDATE contexts
   SET current_image = NULL
 WHERE current_image LIKE 'blob:%'
    OR current_image LIKE 'data:%';
