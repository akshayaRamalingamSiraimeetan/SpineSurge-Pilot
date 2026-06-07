/* Dashboard static UI config. The recent/unfinished/continue-working feeds and task list are now
   LIVE (GET /dashboard via useDashboard). What remains here is `importSources` — a description of
   the available import options, which is UI configuration, not patient data. */

export interface ImportSource {
  icon: string;
  title: string;
  desc: string;
  tags: string[];
}

export const importSources: ImportSource[] = [
  { icon: 'folder', title: 'Local Files', desc: 'Import DICOM or image files from your computer.', tags: ['DICOM', 'jpg', 'png', 'tiff', 'bmp', '+ more'] },
  { icon: 'folder', title: 'Local Folder', desc: 'Import all imaging files from a selected folder.', tags: ['DICOM', 'jpg', 'png', 'tiff', 'bmp', '+ more'] },
  { icon: 'cloud', title: 'PACS', desc: 'Query and retrieve studies from a PACS server.', tags: ['DICOM', 'All Modalities'] },
];
