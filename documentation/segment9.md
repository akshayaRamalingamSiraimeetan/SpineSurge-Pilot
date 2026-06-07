# Segment 9 — Engineering Principles & Product Roadmap

## Product Identity

SpineSurge is a local-first spine surgery planning workspace.

Its primary purpose is to support assessment, planning, communication, and knowledge reuse around spinal cases.

---

## Architectural Priorities

Decisions should be evaluated in the following order:

```text
Reliability
↓
Workflow
↓
Clinical Value
↓
Usability
↓
Features
↓
Technology
```

Technology should support workflow, not define it.

---

## Accepted Decisions

The following architectural decisions are considered stable:

```text
Patient → Case → Study

Study = Primary Working Object

Study = Primary Save Unit

Measurements belong to Studies

Plans belong to Studies

Study Reports + Case Reports

Collections reference Cases

Compare = Viewer Layout

Local-First Architecture

Home → Workspace → Library
```

---

## Rejected Decisions

The following approaches should not be pursued:

```text
Feature-Centric Workflows

Patient-Centric Workflow

Compare as a Module

Separate 2D and 3D Applications

Cloud-Only Architecture

Reports as Source of Truth

Case Duplication in Collections
```

---

## Feature Evaluation Rules

Every new feature should answer:

### Ownership

```text
Where does it belong?
```

Typical locations:

```text
Measurement
Plan
Annotation
Report
Collection
```

### Workflow

```text
Does it strengthen the clinical workflow?
```

### Clinical Value

```text
What does the surgeon gain?
```

Examples:

```text
Confidence
Speed
Clarity
Communication
Learning
```

Features that cannot clearly answer these questions should be reconsidered.

---

## Refactoring Priorities

Current priorities:

```text
1. Persistence & Recovery

2. State Management

3. Workspace Unification

4. Import Workflow

5. Planning Integration

6. Reporting Integration
```

The objective is to improve coherence and reliability rather than increase feature count.

---

## Roadmap

### Phase 1 — Foundation

Focus:

```text
Persistence
Autosave
State Management
Unified Workspace
```

### Phase 2 — Planning

Focus:

```text
Osteotomy Planning
Instrumentation Planning
Visualization
Reporting
```

### Phase 3 — Knowledge Platform

Focus:

```text
Collections
Teaching
Research
Case Reuse
```

### Phase 4 — Collaboration

Focus:

```text
Sharing
Synchronization
Cloud Libraries
```

---

## Architectural Statement

SpineSurge is a local-first spine surgery planning workspace built around studies, organized through cases, and supported by measurements, planning tools, reports, and reusable knowledge collections.

Future decisions should reinforce workflow coherence, reliability, and clinical value while preserving the image-centric nature of the platform.