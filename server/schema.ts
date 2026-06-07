import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const patients = sqliteTable('patients', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    age: integer('age'),
    gender: text('gender'), // This will replace both 'gender' and 'sex'
    dob: text('dob'),
    contact: text('contact'),
    lastVisit: text('last_visit'),
    hasAlert: integer('has_alert', { mode: 'boolean' }).default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
});

export const visits = sqliteTable('visits', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    visitNumber: text('visit_number'),
    date: text('date'),
    time: text('time'),
    diagnosis: text('diagnosis'),
    comments: text('comments'),
    height: text('height'),
    weight: text('weight'),
    consultants: text('consultants'),
    surgeryDate: text('surgery_date'),
});

export const studies = sqliteTable('studies', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    visitId: text('visit_id').references(() => visits.id, { onDelete: 'cascade' }),
    modality: text('modality').default('X-Ray'),
    source: text('source').default('Import'),
    acquisitionDate: text('acquisition_date'),
});

export const scans = sqliteTable('scans', {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull().references(() => studies.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(), // Should be relative to uploads dir
    type: text('type').default('Imported'),
    date: text('date'),
});

export const contexts = sqliteTable('contexts', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    visitId: text('visit_id').references(() => visits.id, { onDelete: 'set null' }),
    mode: text('mode').notNull(), // 'view', 'plan', 'compare'
    name: text('name'),
    lastModified: text('last_modified'),
    annotations: text('annotations').default('[]'), // JSON
    toolState: text('tool_state').default('{}'), // JSON
});

export const contextStudies = sqliteTable('context_studies', (t) => ({
    contextId: t.text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    studyId: t.text('study_id').notNull().references(() => studies.id, { onDelete: 'cascade' }),
}), (t) => ({
    pk: primaryKey({ columns: [t.contextId, t.studyId] }),
}));

export const measurements = sqliteTable('measurements', {
    id: text('id').primaryKey(),
    contextId: text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    toolKey: text('tool_key').notNull(),
    fragmentId: text('fragment_id'),
    points: text('points'), // JSON array of Point
    result: text('result'), // JSON any
    metadata: text('metadata'), // JSON any (for 'measurement' property in UI)
    timestamp: integer('timestamp'),
});

export const implants = sqliteTable('implants', {
    id: text('id').primaryKey(),
    contextId: text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    fragmentId: text('fragment_id'),
    position: text('position'), // JSON Point
    angle: real('angle'),
    properties: text('properties'), // JSON any
    timestamp: integer('timestamp'),
});

export const reports = sqliteTable('reports', {
    id: text('id').primaryKey(),
    visitId: text('visit_id').notNull().references(() => visits.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    title: text('title'),
    createdAt: text('created_at'),
});

// Relations
export const patientsRelations = relations(patients, ({ many }) => ({
    visits: many(visits),
    studies: many(studies),
    contexts: many(contexts),
}));

export const visitsRelations = relations(visits, ({ one, many }) => ({
    patient: one(patients, { fields: [visits.patientId], references: [patients.id] }),
    studies: many(studies),
    reports: many(reports),
}));

export const studiesRelations = relations(studies, ({ one, many }) => ({
    patient: one(patients, { fields: [studies.patientId], references: [patients.id] }),
    visit: one(visits, { fields: [studies.visitId], references: [visits.id] }),
    scans: many(scans),
}));

export const scansRelations = relations(scans, ({ one }) => ({
    study: one(studies, { fields: [scans.studyId], references: [studies.id] }),
}));

export const contextsRelations = relations(contexts, ({ one, many }) => ({
    patient: one(patients, { fields: [contexts.patientId], references: [patients.id] }),
    visit: one(visits, { fields: [contexts.visitId], references: [visits.id] }),
    studies: many(contextStudies),
    measurements: many(measurements),
    implants: many(implants),
}));

export const contextStudiesRelations = relations(contextStudies, ({ one }) => ({
    context: one(contexts, { fields: [contextStudies.contextId], references: [contexts.id] }),
    study: one(studies, { fields: [contextStudies.studyId], references: [studies.id] }),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
    context: one(contexts, { fields: [measurements.contextId], references: [contexts.id] }),
}));

export const implantsRelations = relations(implants, ({ one }) => ({
    context: one(contexts, { fields: [implants.contextId], references: [contexts.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
    visit: one(visits, { fields: [reports.visitId], references: [visits.id] }),
}));
