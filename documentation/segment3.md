# SpineSurge Pro — Information Architecture

## Purpose

This section defines the core data model and ownership structure used throughout SpineSurge.

The hierarchy exists for organization, persistence, retrieval, and reporting. It does not define clinical workflow.

---

## Core Hierarchy

```text
Patient
│
└── Case
     │
     ├── Study
     │    ├── Measurements
     │    ├── Plans
     │    ├── Annotations
     │    └── Study Reports
     │
     ├── Case Reports
     └── Notes
```

Knowledge management remains separate:

```text
Library
│
└── Collections
     └── Case References
```

---

## Ownership Principle

Every object must have a single owner.

This rule determines where all data is stored and prevents ambiguity as the platform evolves.

---

## Patient

Represents an individual.

Responsibilities:

- Demographic information
- Long-term organization of clinical history
- Ownership of cases

A patient may contain multiple unrelated clinical problems over time.

---

## Case

Represents a single clinical episode, pathology, treatment course, or follow-up process.

Examples:

- Adult Degenerative Scoliosis
- Revision Deformity
- Postoperative Follow-up

Responsibilities:

- Group related studies
- Store case-level notes
- Store case-level reports

Owns:

- Studies
- Case Reports
- Notes

---

## Study

The study is the primary unit of clinical work.

Examples:

- Preoperative AP X-ray
- Preoperative LAT X-ray
- CT Scan
- MRI Scan
- Postoperative Imaging

Owns:

- Measurements
- Plans
- Annotations
- Study Reports

A study should remain self-contained and portable, including all analysis and planning information associated with its imaging data.

---

## Study Metadata

Studies are described through metadata rather than additional hierarchy levels.

Core attributes include:

- Modality
- View
- Acquisition Date
- Timepoint

Examples:

### Modality

- X-ray
- CT
- MRI
- EOS

### View

- AP
- LAT
- Axial
- Sagittal
- Coronal
- 3D

### Timepoint

- Preoperative
- Immediate Postoperative
- Follow-up

These attributes classify studies without changing the hierarchy.

---

## Reports

Two report types exist:

### Study Report

Summarizes a single study and its associated analysis.

### Case Report

Summarizes findings across multiple studies within a case.

---

## Ownership Summary

```text
Patient
 └── Cases

Case
 ├── Studies
 ├── Case Reports
 └── Notes

Study
 ├── Measurements
 ├── Plans
 ├── Annotations
 └── Study Reports
```

---

## Architectural Rule

A simple rule should guide future feature placement:

- Features that organize information belong to Patient or Case.
- Features that operate on imaging belong to Study.

This model should remain stable as new capabilities are introduced.