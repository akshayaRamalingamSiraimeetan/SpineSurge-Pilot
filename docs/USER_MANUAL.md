# SpineSurge — User Manual (Pilot)

Welcome to SpineSurge, a spine surgery planning tool that runs in your web browser. You can measure spinal
alignment on X-rays, plan osteotomies and implants in 2D or 3D, compare pre-op and post-op images, and
export a PDF report — all in one place.

**Open SpineSurge:** <https://spinesurge-demo.onrender.com>

---

## Contents
1. [Before you start](#1-before-you-start)
2. [Create your account](#2-create-your-account)
3. [Finding your way around](#3-finding-your-way-around)
4. [Add a patient and a study](#4-add-a-patient-and-a-study)
5. [Assessment — measuring](#5-assessment--measuring)
6. [Planning — osteotomies and implants](#6-planning--osteotomies-and-implants)
7. [3D planning for CT / MR](#7-3d-planning-for-ct--mr)
8. [Compare — before vs after](#8-compare--before-vs-after)
9. [Report — export a PDF](#9-report--export-a-pdf)
10. [Sharing and teams](#10-sharing-and-teams)
11. [Settings](#11-settings)
12. [Keyboard and mouse shortcuts](#12-keyboard-and-mouse-shortcuts)
13. [Privacy and pilot monitoring](#13-privacy-and-pilot-monitoring)
14. [Troubleshooting](#14-troubleshooting)
15. [Giving feedback](#15-giving-feedback)

---

## 1. Before you start

| You need | Why |
|---|---|
| A laptop or desktop with **Chrome or Edge** (recent version) | The canvas and 3D viewer need a modern browser. Phones and tablets aren't supported yet. |
| An internet connection | SpineSurge is a hosted web app; your work is saved online. |
| **Anonymised** images only | Remove the patient's name, ID and date of birth before uploading. Use a code like "Case 07" as the patient name. |
| X-rays as JPG / PNG / DICOM, or a CT / MR folder of DICOM files | These are the formats SpineSurge opens. |

> **First visit of the day can be slow.** The pilot server goes to sleep when nobody uses it. If the page
> takes about a minute to appear, that's normal — it's waking up. After that it's quick.

---

## 2. Create your account

1. Open the link and click **Create Account**.
2. Enter your email and a password, accept the terms, and continue.
3. Check your inbox for a **6-digit code** and type it in.
   Not there after a minute? Look in **Spam** or **Promotions**, or click *Resend*.
4. **Complete your profile** — your name, designation (e.g. Orthopaedic Surgeon) and country.

Next time, just sign in with your email and password.

---

## 3. Finding your way around

**Home and Patients** (the left sidebar)

- **Home** — your recent studies and quick actions (*Add study*).
- **Patients** — all your patients, their visits and studies, plus a *Shared with me* section.
- **Settings** (gear icon, bottom-left) — your preferences (see [Settings](#11-settings)).
- **Light / dark mode** — the sun/moon button.

**The workspace** (opens when you open a study)

The bar at the top has four tabs, which follow a typical case:

| Tab | What you do there |
|---|---|
| **Assessment** | Calibrate the image and take measurements |
| **Planning** | Plan osteotomies, screws, rods and cages; save plans |
| **Compare** | Put a second image (Image B) beside yours and compare the numbers |
| **Report** | Build a PDF report from everything above |

- **Left panel** = tools. **Right panel** = results and details. Use the small tabs on the panel edges to hide or show them.
- The **save status** in the top bar shows *Saving…* / *Saved*. Work is saved automatically — there's no Save button to remember.
- The **back arrow** at top-left takes you back to Home/Patients.

---

## 4. Add a patient and a study

1. Go to **Patients → New Patient**. Enter an anonymised name (e.g. "Case 07"), age and sex. Save.
2. Select the patient and click **Add New Study**. Choose the type (X-Ray, CT, MR) and give it a name
   (e.g. "Standing lateral, pre-op").
3. Import your image:
   - **X-ray:** choose a JPG, PNG or a single DICOM file.
   - **CT / MR:** choose the whole folder of DICOM files. Extra files on a CD (like *DICOMDIR*) are skipped
     automatically. Please wait for the upload to finish before leaving the page.
4. The study opens in the workspace.

> **Shortcut:** on Home, the *Add study* button under *Recent Studies* does the same thing.

**Rename, change status or delete** a study from the ⋮ menu on its card. Deleting is permanent.

---

## 5. Assessment — measuring

### Step 1: Calibrate (do this first)
Measurements in **mm** need calibration. Follow the **Calibrate** prompt:
1. Click the two ends of something with a known length (a calibration ball, ruler or implant).
2. Type its real length in mm and confirm.

Without calibration, distances are shown in pixels; angles are always correct.

### Step 2: Pick a tool and click points
Choose a tool from the left panel, then click the landmarks on the image. The tool tells you which point
to click next. Results appear in the right panel straight away.

| Group | Tools |
|---|---|
| **Alignment** | Cobb Angle · Pelvic Parameters (PI / PT / SS) · PI-LL Mismatch · SVA · Thoracic Kyphosis · Lumbar Lordosis · Cervical Lordosis |
| **Extended — Curvature** | Cobb Multi-Curve · Rib Vertebral Angle Difference (RVAD) |
| **Extended — Balance** | Trunk Shift · Apical Vertebral Tilt · Pelvic Obliquity |
| **Extended — Global** | T1 Pelvic Angle (TPA) · Spinopelvic Angle (SPA) · Spinosacral Angle (SSA) · T1SPi · T9SPi · ODHA |
| **Extended — Regional** | Chin-Brow Vertical Angle · CSVL · C7 Plumb Line · Sagittal Vertical Line |
| **Morphology** | Vertebral Body Metrics (choose Sagittal / Coronal) · Canal Area · Spondylolisthesis (slip % and grade) |
| **Generic** | Line · Pen · Text · 2-, 3- and 4-point angles · Circle · Ellipse · Polygon |

**Helpful behaviour**
- **Shared landmarks:** points you've already placed (femoral heads, S1, C7…) are re-used by the next tool,
  so you don't click them twice. Clicking near an existing point snaps to it.
- **Adjusting:** drag any point to move it. A shared point moves in every measurement that uses it.
- **Image controls:** the floating toolbar has zoom, rotate, brightness/contrast, fit-to-screen and undo/redo.
  Drag its handle to dock it on the left or right.
- **In the report or not:** the tick box next to each result in the right panel decides whether it goes into the report.

---

## 6. Planning — osteotomies and implants

Open the **Planning** tab. Your assessment measurements stay visible.

**Osteotomies** (left panel → *Osteotomy*): **PSO**, **SPO**, **Resect**, **Open** (opening wedge).
Place the cut points; the image is split into pieces and repositioned so you can see the correction.
Linked measurements (e.g. lordosis, SVA) update to show the planned values.

**Instruments**: **Screw**, **Rod**, **Cage**, and **Instr. Level** (UIV / LIV tilt).
- Click to place, drag to move.
- Use the handles to resize: screw tip = length and angle, diamond = diameter;
  cage front = length and angle, top/bottom = height, diamond = lordosis.
- Fine-tune exact sizes in the right panel.

**Targets** — the right panel lists your target parameters (choose them in Settings): measured value,
your target, the difference, and what the plan achieves.

**Saving plans** — you can keep several options for one case:
- **Save as Plan 1 / 2 / 3…** stores the current plan.
- **Update Plan N** saves changes to the plan you're working on.
- **New plan** clears the working plan to start another option (saved plans are kept).
- In the saved-plans list: folder icon = continue that plan, bin icon = delete it.

> You need to have added the patient's details before plans can be saved.

---

## 7. 3D planning for CT / MR

When you open a CT or MR study, SpineSurge shows **axial, sagittal, coronal and 3D** views.

1. **Bone segmentation** and **crop** (left panel) help you isolate the spine in 3D.
2. Choose **Screw**, **Rod** or **Cage** and click in a view to place it.
3. Drag the **entry** and **tip** handles to adjust the trajectory; check it in all views.
4. Use the **Maximise** button on a view to enlarge it; click **Restore** to go back to all four views.

> The 3D viewer needs WebGL2 (any recent Chrome/Edge). Large CT series take a little while to upload the first time.

---

## 8. Compare — before vs after

Open the **Compare** tab.

- **Image A** is your case image. Pick which *version* it shows: **No plan** (your assessment), a saved
  plan (**Plan 1, 2…**) or the current working plan. Plans are shown read-only here.
- **Image B**: choose another study and version (for example the post-op X-ray), or import a new file.
  **Replace image** swaps Image B.
- Measure on Image B with the toolbar in the middle. The right panel shows **A vs B** and the difference for each parameter.

Typical uses: pre-op vs post-op, standing vs bending films, Plan 1 vs Plan 2.

---

## 9. Report — export a PDF

Open the **Report** tab. It builds itself from your measurements, plans and comparison.

- **Left panel** — pick which sections to include and drag them into order.
- **Right panel** — title, hospital name and logo, page size, accent colour, text size, footer, page numbers.
- **Preview PDF** — look at it first.
- **Export PDF** — downloads the PDF. Keep *Save a copy to the patient record* ticked to store it with the study.

> Set a default hospital logo and institution once in **Settings → Reports**.

---

## 10. Sharing and teams

**Share a study with a colleague**
1. On the study card, open ⋮ → **Share**.
2. Type their login email and choose **View** (they can look) or **Edit** (they can work on it with you).
3. They'll find it under **Patients → Shared with me**. With Edit, changes sync live for both of you.
4. Change or remove access in the same dialog at any time.

Your studies are **private** — nobody else sees them unless you share them.

**Organizations (teams)**
- A team lead can **create an organization** and invite members by email: click your **profile picture** at the bottom of the sidebar to open the workspace panel.
- The same panel switches between your **Personal** and **Organization** workspace; patients stay in the workspace they were created in.
- **Admins** can open members' studies in that organization view-only (Members → eye icon). **Members** work on their own studies.

---

## 11. Settings

Gear icon (bottom-left of Home/Patients):

| Setting | What it does |
|---|---|
| **Theme** | Light, Dark or follow your computer |
| **Default hospital logo / institution** | Pre-filled on every report |
| **Target measurements** | Which parameters appear in Planning → Targets (click a row to toggle) |
| **Snap to existing points** | Clicks near a placed point re-use it exactly |
| **Reuse landmarks** | New tools pre-fill points you've already placed |
| **Image toolbar position** | Move the floating toolbar back to its default place |

---

## 12. Keyboard and mouse shortcuts

| Action | How |
|---|---|
| Undo / Redo | **Ctrl + Z** / **Ctrl + Y** (or Ctrl + Shift + Z) |
| Cancel the current tool | **Esc** |
| Delete the selected implant | **Delete** or **Backspace** |
| Finish a polygon | **Enter** |
| Zoom | Mouse wheel or touchpad pinch, or the zoom slider |
| Pan (move the image) | **Right-click and drag** (or middle-button drag) |

Shortcuts are paused while you type in a box or have a dialog open.

---

## 13. Privacy and pilot monitoring

- Use **anonymised images only** during the pilot.
- Your patients and studies are visible only to you and the people you share them with (and your organization's admins, view-only).
- **Pilot monitoring:** to learn how SpineSurge is used and to fix problems quickly, the SpineSurge pilot team
  can see usage on the platform — for example which tools you used, the images you uploaded, the plans and
  comparisons you saved and the reports you exported. The team can view your studies **read-only**; they
  cannot change or delete anything. This is used only to improve SpineSurge.
- Connection to SpineSurge is encrypted (HTTPS); uploaded files are stored privately and are only served to signed-in users who have access.

If you have questions about your data, contact the SpineSurge team.

---

## 14. Troubleshooting

| Problem | Try this |
|---|---|
| Page takes a long time to open | The server was asleep — wait about a minute and refresh. |
| No sign-up code email | Check Spam/Promotions, then click *Resend*. |
| Distances show in px, not mm | Calibrate the image first (Assessment → Calibrate). |
| 3D view is blank | Use a recent Chrome or Edge; make sure hardware acceleration is on in browser settings. |
| CT upload stops | Keep the tab open until the upload finishes; check your connection and try again. |
| "View only" banner — tools are greyed out | The study was shared with you as View, or you're an admin viewing a member's study. Ask the owner for Edit. |
| Something looks wrong after many edits | Refresh the page — your work is saved automatically. |
| Signed out unexpectedly | Your session expired (after 7 days). Sign in again; nothing is lost. |

---

## 15. Giving feedback

Your feedback shapes SpineSurge. When something doesn't work or could be better, please send the SpineSurge team:

1. **What you were trying to do**
2. **What you expected**
3. **What happened instead** — a screenshot helps a lot
4. The study name (not the patient's real details)

Thank you for taking part in the pilot!
