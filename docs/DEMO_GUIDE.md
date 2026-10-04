# SpineSurge — Demo Guide (for testers)

**Link:** https://spinesurge-demo.onrender.com  ·  **Login:** create your own account on the sign-in page

SpineSurge is a browser-based spine surgery planning tool. **Full step-by-step manual: `docs/USER_MANUAL.md`.** The demo server sleeps when unused —
the first visit can take about a minute to load. Use a recent Chrome or Edge on a laptop
or desktop (the 3D module needs WebGL2). Please use **anonymised images only**.

## 1. Sign in
Open the link → **Create Account** with your email and a password → enter the 6-digit code we email
you (check Spam/Promotions if it's not in your inbox within a minute) → complete your profile. Your patients and studies are
private; share a study from its card (⋮ → Share) by entering the other person's login email, with
View or Edit rights. A team lead can create an organization and invite members.

## 2. Start a study
Patients → **New Patient** → select the patient → **Add New Study** → import an X-ray (JPG/PNG/DICOM)
or a CT/MR folder in the workspace. Home → *Add study* below Recent Studies does the same.

## 3. Assessment (measurements)
- First, follow the **Calibrate** prompt: click the two ends of a known length, type its length in mm.
- Pick a tool on the left (Cobb, SVA, PI/LL, VBM (choose Sagittal/Coronal under it), …) and click
  points on the image. Results appear on the right; the checkbox includes a measurement in the report.

## 4. Planning
- 2D: screws, rods, cages as white silhouettes — drag to move, handles to resize/rotate; fine-tune
  sizes in the right panel. Osteotomy tools are under Planning.
- 3D (CT/MR): axial, sagittal, coronal and 3D views. Pick Screw/Rod/Cage on the left, click in a
  view to place, drag the entry/tip handles to adjust the trajectory; bone segmentation and crop on the left.

## 5. Compare
Image A is your case image. Load **Image B** (another study or a file), measure on both — the right
panel shows the differences. "Replace image" swaps Image B.

## 6. Report
Live report of everything above. Left: choose/reorder sections. Right: title, hospital, page size,
colours → **Preview PDF** / **Export PDF**.

## Pilot monitoring
During the pilot the SpineSurge team can see how the app is used (tools, uploaded images, plans, comparisons,
reports) and can open studies read-only, to improve the product. See USER_MANUAL.md §13.

## Feedback
Please note what you tried, what you expected and what happened (screenshots help) and send it to the
SpineSurge team.

_Light/dark mode: sun/moon button (bottom-left on Home/Patients, top-right in the workspace)._
