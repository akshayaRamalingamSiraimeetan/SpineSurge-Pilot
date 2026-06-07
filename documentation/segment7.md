# Segment 7 — UI & Workspace Architecture

## Application Structure

SpineSurge consists of three primary areas:

```text
Home
Workspace
Library
```

### Home

Provides access to:

- New Study
- Recent Studies
- Recent Reports
- Collections

### Workspace

Primary environment for assessment, planning, visualization, and reporting.

### Library

Access to collections, teaching material, research cohorts, and reusable case knowledge.

---

## Workspace Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar                                                    │
├───────┬───────────────────────────────────────┬─────────────┤
│       │                                       │             │
│ Left  │               Viewer                  │    Right    │
│ Panel │                                       │    Panel    │
│       │                                       │             │
├───────┴───────────────────────────────────────┴─────────────┤
│ Floating Viewer Toolbar                                    │
└─────────────────────────────────────────────────────────────┘
```

The viewer remains the primary workspace and should occupy most available screen space.

---

## Top Bar

Contains global actions and workspace context.

Examples:

```text
Patient
Case
Study

Save
Export
Reports
Compare
Library
Settings
```

---

## Left Panel — Clinical Tools

Tools available for the current study.

### Assessment

```text
Coronal
Sagittal
Spinopelvic
Pathology
```

### Planning

```text
Osteotomy
Instrumentation
```

---

## Viewer

Primary working surface for:

- Image review
- Measurements
- Annotations
- Planning

Supported modalities:

```text
X-ray
CT
MRI
EOS
```

---

## Floating Viewer Toolbar

Viewer-specific controls.

Examples:

```text
Zoom
Pan
Rotate
Brightness
Contrast
Window / Level
Reset View
```

---

## Viewer Layouts

```text
Single View
Split View
Quad View
```

Examples:

```text
Preop vs Postop
Current vs Planned
AP + LAT + MRI + CT
```

Layouts affect presentation only and do not create additional data structures.

---

## Right Panel — Case Summary

Provides continuous clinical context.

Displays:

```text
Study Information

Measurements

Plans

Findings

Notes
```

Example:

```text
Cobb = 42°
PI-LL = 21°

PSO at L3
Fusion T10-L5
```

---

## Secondary Information

Patient details, metadata, and administrative information should remain accessible but secondary to the workspace.

---

## Architectural Summary

```text
Top Bar
    ↓
Global Actions

Left Panel
    ↓
Assessment & Planning Tools

Viewer
    ↓
Primary Working Surface

Floating Toolbar
    ↓
Image Controls

Right Panel
    ↓
Case & Plan Summary
```