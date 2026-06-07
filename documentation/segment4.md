# SpineSurge Pro — Measurement, Annotation, and Planning Model

## Purpose

This section defines the primary working objects contained within a study and the rules governing their storage, ownership, and behavior.

---

## Tool Categories

All interactive study data belongs to one of three categories:

```text
Measurements
Annotations
Plans
```

Future features should extend these categories whenever possible.

---

## Measurements

Measurements quantify anatomical, alignment, or pathological characteristics present within a study.

Examples:

- Cobb Angle
- Coronal Balance
- TK
- LL
- SVA
- PI
- PT
- SS
- PI-LL
- Listhesis
- Stenosis Measurements

Measurements provide objective evidence and should remain separate from clinical interpretation.

### Measurement Model

```typescript
Measurement {
    id
    type
    studyId

    landmarks
    geometry

    result
    metadata

    createdAt
    modifiedAt
}
```

### Persistence Rules

Measurements must store both geometric inputs and calculated outputs.

Store:

- Landmarks
- Points
- Lines
- Curves
- Polygons
- Derived values

Never store numerical results alone.

This enables recalculation, editing, validation, visualization, and future algorithmic processing.

### Landmark Model

All measurements are derived from geometric landmarks.

Supported primitives include:

- Point
- Line
- Polygon
- Curve
- Axis

---

## Annotations

Annotations provide visual, educational, or contextual information associated with a study.

Examples:

- Labels
- Notes
- Highlight Regions
- Reference Lines
- Teaching Markers

Annotations communicate information but do not represent measurements or treatment plans.

### Annotation Model

```typescript
Annotation {
    id
    studyId

    type
    geometry

    style
    note
}
```

---

## Plans

Plans represent proposed interventions associated with a study.

Examples:

- Osteotomies
- Instrumentation
- Rod Design
- Cage Placement

Planning objects are image-dependent and must remain linked to study geometry.

### Planning Categories

#### Osteotomy Plans

Examples:

- PSO
- SPO
- Opening Wedge
- Closing Wedge
- Resection

Store:

- Location
- Parameters
- Geometry
- Transform Data

#### Instrumentation Plans

Examples:

- Pedicle Screws
- Rods
- Cages
- Future Implant Types

##### Screw Model

```typescript
Screw {
    id

    level
    side

    entryPoint
    trajectory

    diameter
    length
}
```

##### Rod Model

Store:

- Anchor Points
- Curvature
- Length
- Associated Screws

##### Cage Model

Store:

- Location
- Size
- Orientation
- Implant Type

### Persistence Rules

All planning objects must remain editable and persist through save, export, import, and restoration workflows.

---

## Study State

The complete working state of a study consists of:

```text
Study

 ├── Measurements
 ├── Annotations
 ├── Plans
 └── Reports
```

Together these objects represent all analysis, planning, and documentation associated with the study.

---

## Future Extensions

A future simulation layer may be introduced for derived predictions such as:

- Predicted Correction
- Predicted Alignment
- Expected Outcome

Simulation outputs should remain separate from planning objects and be treated as derived data.

---

## Architectural Rule

Every study-level feature should fit into one of the following categories:

- Measurement
- Annotation
- Plan
- Simulation (future)

Features that do not clearly belong to one of these categories should be re-evaluated before implementation.