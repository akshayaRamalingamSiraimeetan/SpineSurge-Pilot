# SpineSurge Pro — UI Design Spec (Source of Truth)

> Extracted from `MyDesign.pdf` (28 pages) + the Claude Design dashboard handoff. This is the
> authoritative reference for the rebuilt UI. The **dashboard** is fully designed by Claude Design
> (HTML handoff); **all other screens are specified by the PDF** and must be built to match.

---

## 1. Brand & design intent
Clinical, precise, confident. White-glove medical software. Calm neutrals with a single bold **red**
accent. Two themes (light default + dark). Imaging viewports are always pure black.

- **Logo:** stylized red "S" spine mark. Wordmark `SPINESURGE` (black/white) + `PRO` with a red underline.
- **Vibe:** generous whitespace, rounded cards, soft shadows, crisp typography, color used semantically (not decoratively).

## 2. Design tokens

### Color
| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` (red) | `#E8362D` | `#FF453A` | primary buttons, active nav, links, logo, in-progress |
| `--accent-soft` | `#FDECEC` | `rgba(232,54,45,.15)` | active nav bg, badge bg |
| `--bg` | `#F5F6F8` | `#0A0A0B` | page background |
| `--surface` | `#FFFFFF` | `#141416` | cards, panels, modals |
| `--surface-2` | `#FAFAFB` | `#1B1B1E` | nested rows, table headers |
| `--border` | `#ECECEF` | `#242427` | hairlines, card borders |
| `--text` | `#0E0E10` | `#F5F5F7` | primary text |
| `--text-muted` | `#6B7280` | `#9CA3AF` | secondary text/labels |
| `--canvas` | `#000000` | `#000000` | imaging viewport (always black) |

### Semantic measurement / status colors (used on canvas overlays + value readouts)
| Color | Hex | Meaning |
|---|---|---|
| Amber/orange | `#F59E0B` | primary deformity angles (Cobb, TK, LL, TPA…) |
| Blue | `#3B82F6` | pelvic parameters (PI, PT, SS, TPA group) |
| Green | `#22C55E` | reference lines / in-range / improved (SVA, SVL, deltas) |
| Red | `#E8362D` | out-of-range / worsened / mismatch |
| Purple | `#A855F7` | pathology (canal area) |
| Status dots | red = In Progress; green = Completed/Connected; gray = Disconnected | |

### Typography
- Family: **Inter** (confirmed in report editor). Fallback system sans.
- Page title (greeting) ~28–32px bold; section headings ~18–20px semibold; body 14px; labels 12–13px uppercase tracking for panel/table headers; measurement values 14–16px medium.

### Shape & elevation
- Radius: cards/modals `~16px` (rounded-2xl), buttons/inputs `~10px`, pills full.
- Shadow: soft, low-spread (`0 1px 2px` + `0 8px 24px rgba(0,0,0,.06)` light).
- Borders: 1px hairline `--border`.

## 3. Navigation patterns (two)
- **Icon rail** (Dashboard, Workspace): ~64px left rail — logo top; icons Home, Workspace, Patients, Library; Settings + avatar bottom. Active icon = red glyph on `--accent-soft` rounded square.
- **Labeled sidebar** (Patients, Library): ~260px — logo+wordmark top; labeled nav (Home, Workspace, ~~Reports~~ removed, Library, Patients); user profile (avatar + name + org) bottom. Often paired with a **second list column**.

> Note (PDF annotation): the standalone **Reports** nav item is struck out — reporting lives **inside the workspace** (Report tab), not as a top-level page.

## 4. Screen inventory (build targets)

### 4.1 Dashboard (Home) — *Claude Design HTML = source*
Header: "Good morning, Dr. {name}" + subtitle; bell (badge) + **New Study** + kebab.
- **Continue Working** hero card: thumbnail, patient name, diagnosis chip, Open Workspace, right meta (last opened, time ago, study count, status).
- **Recent Studies**: 4 horizontal cards (thumb, name, diagnosis, date, N studies, kebab) + View all.
- **Unfinished Studies**: table-like rows (thumb, name+modality+date, diagnosis, last edited, status dot, Open Workspace, kebab) + "View all in-progress studies".
- **Notifications** popover: grouped Connections / Collaboration / System; "Mark all as read"; rows with icon, title, subtitle, time, unread dot.
- **Tasks** popover (from kebab): Pending Review, Missing Information, Unsaved Workspaces, Failed Processing, Session Recovery; count badge; "View all tasks".
   
### 4.2 Create New Study (modal)
Title + subtitle; "Choose Import Source": three large option rows — **Local Files**, **Local Folder**, **PACS** (icon, title, desc, format chips DICOM/jpg/png/tiff/bmp/All Modalities, chevron). Footer: supported-formats hint + Cancel.

### 4.3 Workspace (the core — tabs: Assessment · Planning · Compare · Report)
Common chrome: back arrow + patient header (name, age/sex, MRN, diagnosis); center segmented tabs (active = red pill); top-right **View Report** + kebab. Center = black canvas with floating **view dropdown** (AP/Lateral/…) top-left and a **vertical tool toolbar** right (cursor, pen, angle, text, eraser, fullscreen, undo, redo, camera). Right panel: collapsible **Case Summary** + **Current Measurements/Plan**.

- **Assessment** — left "Measurement Tools" panel with category tabs **A**lignment / **D**eformity / **P**athology / **M**anual:
  - *Alignment:* Cobb, SVA, PI-LL, Pelvis, TK, LL, CL. Right panel groups: Spinal Alignment, Pelvic Parameters, Spinopelvic Relationships, Other.
  - *Deformity:* Coronal/Sagittal toggle. Coronal: CMC, TS, AVT, RVAD, PO, VBM (ref lines CSVL, C7PL). Sagittal: TPA, SSA, SPA, T1SPi, T9SPi, ODHA, CBVA (ref lines SVL, C7PL, GL).
  - *Pathology:* Canal Area (mm²), Spondylolisthesis (slip dist, slip %, Meyerding grade).
  - *Manual:* Line, Pen, Annotation, 2-Point Angle, 3-Point Angle, Circle, Ellipse, Polygon.
  - **Calibration** button; **Reference Lines** collapsible (toggleable, with values); **Patient information missing** banner; **Case Summary** (editable fields: name, MRN, age, sex, height, weight + study notes); **Step-by-step guide** red coachmark (carousel dots).
- **Planning** — two steps: **1 Target Correction** (alignment goals: PI-LL, SVA, TK, LL, PT with Current vs Target dropdowns; right "Current Plan" shows `current → target` deltas) and **2 Simulation** (Osteotomy: PSO, SPO, VCR, Open; Instrumentation: Screw, LIV/UIV, Rod, Cage; right "Current Plan (Simulation)" with osteotomy + instrumentation summary; Clear Plan). 3D/CT variant: 4-quadrant Axial/Sagittal/Coronal/3D, Volume Rendering vs Segmentation, **HU Threshold** histogram slider, Screw/Rod property panels.
- **Compare** — Left(Current)/Right(Selected) date selectors + swap; dual black viewports; right **Measurement Comparison** table (Current | Selected | Change) grouped Sagittal/Coronal/Pelvic/Global. (Annotation: "make comparison module scalable" → support N studies.)
- **Report** — **Report Builder** left (draggable, toggleable sections: Cover, Patient Summary, Alignment Summary, Measurement Table, Current vs Simulation, Surgical Plan, Osteotomies, Instrumentation, Images, Notes; + Add Section). Center = paginated WYSIWYG document (rich-text toolbar). Right **Section Properties** (Content/Style tabs; title, description, included categories, display options: decimals/units, value color coding legend). Top-right Preview PDF / Export PDF.

### 4.4 Patients
Labeled sidebar + **patient list** column (search + filter, avatar initials, name, age/sex, MRN, kebab, + New Patient) + **patient detail**: header (initials avatar, name, age/sex, MRN, diagnosis, first seen, Patient Details, kebab) and a **vertical timeline** of visits → expandable study cards (thumbnail, modality, region, size, status, Open Workspace, View Report, kebab) + "Add new study to timeline". (Future annotations: measurement trend graphs, study intelligence over time, collaboration.)

### 4.5 Library
Labeled sidebar + **collections sidebar** (Collections / Shared with me / Recently added / My Collections list with counts) + **collection view**: header (cover, name, Private badge, description, study count, owner, created date, Edit Collection) + Studies/Details tabs + **study grid** (modality badge, thumbnail, case name, patient, date, kebab) with sort / grid-list toggle / filter / Load more. + New Collection.

### 4.6 Settings (modal, left tabs)
Tabs: **General** (profile fields + preferences: theme, language, date/time format, timezone), **DICOM & PACS** (auto-read metadata toggle, default import destination, DICOM port, PACS connections table w/ status + Add PACS + Test All Connections), **Workspace** (default view AP/Lateral/3D, units, auto-save interval, interpolation, reference lines default, report template, undo/redo, warn before discard), **Library & Reports** (report generation defaults, layout Compact/Standard/Detailed, includes, library view), **Instrumentation Library** (locked/🔒), **Administration** (Users table w/ roles + Invite User, Roles & Permissions, Storage & Usage stats, Audit Logs). Footer: Reset to Defaults / Save Changes; app version badge.

## 5. Core architecture principle (from PDF annotations — must hold)
- **"A tool never updates the UI; it outputs measurements and the UI stores them."** Tools are pure → emit a measurement object → state stores it → Canvas, Measurement Panel, Report, and autosave all render *from state*. (This matches the backend `contexts/measurements` model and `LOGIC_PORT_PLAN.md`.)
- Keyboard-first workflow (shortcuts); deactivate tool after a measurement completes; single-landmark sessions; don't redraw geometry on every store update; allow importing prior studies with existing landmarks.

## 6. shadcn/ui mapping (suggested)
Icon rail/sidebar (custom) · Card · Dialog (Create Study, Settings) · Tabs (workspace + settings + report builder) · Button (default/outline/ghost; red primary) · DropdownMenu (kebabs, view selector) · Popover (notifications, tasks) · Select · Slider (HU threshold, image controls) · Switch (settings toggles) · Table (PACS, users, comparison, measurement) · Badge (modality, status, Private) · ScrollArea · Tooltip · Separator · Avatar · Input/Textarea/Label · Sonner (toasts). Rich-text editor (Report) = TipTap. Drag-reorder (Report sections) = dnd-kit.

> **Reconciliation rule:** if the design conflicts with a ported tool's UX, design wins for
> presentation; the ported logic/result wins for correctness (see `MASTER.md §7`).
