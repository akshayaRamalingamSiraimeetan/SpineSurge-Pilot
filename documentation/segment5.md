# SpineSurge Pro — Reporting & Comparison Architecture

## Purpose

This section defines how study data is transformed into summaries, reports, and communication artifacts.

Reports are derived from existing clinical data and should never become independent sources of truth.

---

## Reporting Principles

Reports are generated from study and case data.

The authoritative data remains:

```text
Study
 ├ Measurements
 ├ Plans
 ├ Annotations
 └ Reports
```

Reports should reference underlying data rather than duplicate or manually recreate it.

This ensures consistency, traceability, and reproducibility.

---

## Information Summarization

Clinical data often contains more detail than is practical to communicate directly.

The reporting layer is responsible for transforming detailed measurements and planning data into concise findings, observations, and decisions.

Examples:

```text
Raw Data
→ Measurements

Findings
→ Clinical Interpretation

Decision
→ Recommended Action
```

This summarization layer forms the foundation of all reporting.

---

## Report Types

### Study Reports

Study Reports summarize a single study and its associated analysis.

Examples:

- Alignment Assessment
- MRI Findings
- CT Planning Summary

Study Reports may include:

- Study Metadata
- Images
- Measurements
- Planning Objects
- Annotations
- Observations
- Notes

Ownership:

```text
Study
 └ Study Reports
```

---

### Case Reports

Case Reports summarize information across one or more studies.

They focus on clinical meaning, treatment strategy, and outcomes rather than individual imaging findings.

Examples:

- Decision Summary
- Planning Report
- Follow-up Report
- Comparison Report

Ownership:

```text
Case
 └ Case Reports
```

---

## Decision Summary

The Decision Summary serves as the primary case-level summary.

Purpose:

> Document the rationale and outcome of clinical planning.

Typical contents:

- Key Findings
- Relevant Measurements
- Treatment Strategy
- Planned Intervention
- Clinical Notes

The emphasis should be on clarity and decision-making rather than exhaustive detail.

---

## Planning Report

Planning Reports communicate operative strategy and planned interventions.

Typical contents:

- Planning Objects
- Supporting Measurements
- Expected Corrections
- Images and Screenshots
- Surgeon Notes

---

## Follow-up Report

Follow-up Reports evaluate progression and outcomes across timepoints.

Examples:

- Postoperative Review
- 6-Month Follow-up
- Annual Follow-up

Their purpose is to document change over time and assess outcomes relative to prior studies or plans.

---

## Comparison Architecture

Comparison is not a workflow, module, or database entity.

It is a relationship between studies or states.

Typical comparisons include:

- Preoperative vs Postoperative
- Current vs Planned
- Expected vs Actual
- Follow-up Progression

---

## Compare View

Compare View is a presentation mode.

Characteristics:

- Interactive
- Temporary
- Not persisted

Examples:

- Split View
- Side-by-Side View
- Multi-Study Layouts

Compare View does not create new data objects.

---

## Comparison Reports

Comparison Reports are persistent communication artifacts generated from comparisons.

They may include:

- Referenced Studies
- Images and Screenshots
- Measurement Differences
- Observations
- Notes

Ownership:

```text
Case
 └ Comparison Reports
```

### Example Model

```typescript
ComparisonReport {
    reportId

    studies[]

    screenshots[]

    measurementsCompared[]

    notes

    createdAt
}
```

---

## Report Generation

Reports should leverage existing study data whenever possible.

Future reporting workflows should automatically assemble:

- Study Metadata
- Measurements
- Planning Objects
- Images
- Notes

into structured report templates.

Manual reconstruction of information should be minimized.

---

## Architectural Summary

```text
Study
 ├ Measurements
 ├ Annotations
 ├ Plans
 └ Study Reports

Case
 ├ Studies
 └ Case Reports
```

Reports are communication artifacts derived from clinical data.

Studies generate evidence and planning information; reports organize and communicate that information for clinical, educational, and research purposes.