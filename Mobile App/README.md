# SpineSurge Measure (mobile)

Independent Expo (React Native + TypeScript) app — **assessment only**: import or photograph an
X-ray, calibrate, measure (distance, angle, Cobb), save on the phone, share. It shares no code
or build with the web app in the parent folder.

## Run it on your phone (no build needed)
1. Install **Expo Go** from the App Store / Play Store.
2. In this folder: `npm install` (first time), then `npm start`.
3. Scan the QR code (iPhone: Camera app; Android: Expo Go). Phone and laptop on the same Wi-Fi
   (or `npx expo start --tunnel`).

## Checks
`npm run typecheck` · `npm run lint` · `npm test` (geometry unit tests, Node's test runner)
· `npx expo-doctor` · `npx expo export --platform android` (bundles the app — catches import errors).

## Features
- **Assessments list** (home): search by name/ID, tap to open, long-press to delete, “＋ New”.
- **New assessment**: image from photos or camera + patient (name*, ID/MRN, age, sex, notes).
- **Measure**: tools Calibrate · Distance · Angle (vertex = 2nd tap) · Cobb (two endplates, any tap
  direction, > 90° supported). A new point follows your finger and is placed when you lift;
  a **loupe** magnifies the spot. Drag any point to adjust; pinch to zoom, drag to pan; tap a line
  to select it → Label / Delete; Undo (whole drag = one step). First open guides you to calibrate.
- **Auto-save** after every change. Data: `<documents>/cases.json` + `<documents>/images/<id>.<ext>`
  (`src/lib/storage.ts`). Nothing leaves the phone unless shared.
- **Share**: preview card (patient, annotated image, values) → native share sheet as JPEG.
- Light/dark follows the phone setting; colours match the web app.

## Structure
```
src/app/_layout.tsx        Stack navigator (Expo Router)
src/app/index.tsx          assessments list
src/app/new.tsx            new assessment / edit patient (?id=)
src/app/case/[id].tsx      measuring screen (tools, results, calibration, share)
src/components/MeasureCanvas.tsx   image + SVG overlay, PanResponder gestures, loupe
src/components/AnnotatedImage.tsx  static annotated image (share card)
src/lib/geometry.ts        maths (distance, angle, Cobb) + tests
src/lib/storage.ts         on-device persistence (expo-file-system File/Directory API)
src/lib/types.ts, theme.ts
```
Gestures use React Native's built-in PanResponder (no gesture/reanimated libraries) so they work
in Expo Go without a custom build.

## Next steps (not built yet)
- **Connect to the SpineSurge server** (optional sign-in → upload assessment as a patient study, so it
  appears in the web app). Needs an API token flow and `POST /api/patients|visits|studies|scans|contexts`.
- PDF export, more tools (SVA, PI/SS/PT), multiple images per patient.
- Store builds: `npx eas-cli@latest build -p ios|android` (app ids `com.inovacex.spinesurge.measure`).
