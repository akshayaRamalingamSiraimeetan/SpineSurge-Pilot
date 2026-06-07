# Segment 8 — Persistence & State Management

## Persistence Principles

SpineSurge is a local-first application.

Core functionality must operate without internet connectivity. Local storage remains the authoritative source of truth for all clinical data.

Cloud services, when present, function as optional backup, sharing, and synchronization mechanisms.

---

## Persistence Hierarchy

Persistence mirrors the application hierarchy.

```text
Patient
 └── Case
      └── Study
           ├── Images
           ├── Measurements
           ├── Plans
           ├── Annotations
           ├── Reports
           └── Notes
```

---

## Study as Save Unit

The Study is the primary persistence unit.

A saved study includes:

```text
Images
Measurements
Plans
Annotations
Reports
Notes
Viewer State
Layout State
```

All information required to reconstruct the workspace should be stored together.

---

## Study Package

Internally, each study should behave as a self-contained package containing:

```text
Images
Metadata
Measurements
Plans
Annotations
Reports
Workspace State
```

This simplifies saving, export, backup, recovery, and sharing.

---

## Import Architecture

Import should immediately create a study and open the workspace.

Supported inputs:

```text
Single Images
Multi-Image Studies
DICOM Folders
CT Series
MRI Series
```

The system should automatically detect modality, series structure, and study grouping whenever possible.

Default workflow:

```text
Import
    ↓
Create Study
    ↓
Open Workspace
    ↓
Autosave
```

Patient and case metadata may be completed later.

---

## Autosave

Autosave is mandatory.

Persistence should occur whenever meaningful study data changes.

Examples:

```text
Measurement Created

Measurement Modified

Plan Created

Plan Modified

Annotation Modified

Note Updated
```

Recommended strategy:

```text
Event-Based Saves
+
Periodic Background Saves
```

---

## Recovery

The system should support automatic recovery after crashes, shutdowns, or interrupted sessions.

On startup, SpineSurge should detect recoverable workspaces and offer restoration.

The objective is to minimize or eliminate loss of clinical work.

---

## State Categories

### Persistent State

Must survive restart.

```text
Measurements
Plans
Annotations
Reports
Notes
```

### Session State

Should survive restart when possible.

```text
Current Study
Viewer State
Layout State
Active Tool
```

### Temporary State

May be discarded safely.

```text
Selections
Hover States
Drag Previews
Temporary Guides
```

---

## Viewer State Persistence

The following should be restored when reopening a study:

```text
Zoom
Pan
Window / Level
Layout
Selected Studies
Compare Layout
```

Only layout state is persisted.

Comparison views do not create separate data objects.

---

## State Ownership

Every state value must have a single owner.

Workspace state should be managed through a centralized state container.

Conceptually:

```text
Workspace State
 ├── Current Study
 ├── Viewer State
 ├── Measurements
 ├── Plans
 ├── Annotations
 ├── Reports
 └── Layout State
```

---

## Export

Export is distinct from saving.

Save preserves editable workspace data.

Export generates communication artifacts such as:

```text
PDF
Images
Presentations
```

Exports must never become the primary storage mechanism.

---

## Cloud Synchronization

Cloud synchronization is optional.

Local study data remains authoritative.

Cloud services may support:

```text
Backup
Sharing
Collaboration
Collections
```

without replacing local persistence.

---

## Architectural Rule

The Study is the primary save and recovery unit.

A user should be able to close and reopen SpineSurge and find the workspace restored exactly as it was left.