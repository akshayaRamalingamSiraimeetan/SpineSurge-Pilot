import { pgTable, text, integer, real, boolean, primaryKey, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const patients = pgTable('patients', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    age: integer('age'),
    gender: text('gender'),
    dob: text('dob'),
    contact: text('contact'),
    lastVisit: text('last_visit'),
    hasAlert: boolean('has_alert').default(false),
    isArchived: boolean('is_archived').default(false),
});

export const visits = pgTable('visits', {
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

export const studies = pgTable('studies', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    visitId: text('visit_id').references(() => visits.id, { onDelete: 'cascade' }),
    modality: text('modality').default('X-Ray'),
    source: text('source').default('Import'),
    acquisitionDate: text('acquisition_date'),
});

export const scans = pgTable('scans', {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull().references(() => studies.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    type: text('type').default('Imported'),
    date: text('date'),
});

export const contexts = pgTable('contexts', {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
    visitId: text('visit_id').references(() => visits.id, { onDelete: 'set null' }),
    mode: text('mode').notNull(),
    name: text('name'),
    lastModified: text('last_modified'),
    annotations: text('annotations').default('[]'),
    toolState: text('tool_state').default('{}'),
});

export const contextStudies = pgTable('context_studies', {
    contextId: text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    studyId: text('study_id').notNull().references(() => studies.id, { onDelete: 'cascade' }),
}, (t) => ({
    pk: primaryKey({ columns: [t.contextId, t.studyId] }),
}));

export const measurements = pgTable('measurements', {
    id: text('id').primaryKey(),
    contextId: text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    toolKey: text('tool_key').notNull(),
    fragmentId: text('fragment_id'),
    points: text('points'),
    result: text('result'),
    metadata: text('metadata'),
    timestamp: integer('timestamp'),
});

export const implants = pgTable('implants', {
    id: text('id').primaryKey(),
    contextId: text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    fragmentId: text('fragment_id'),
    position: text('position'),
    angle: real('angle'),
    properties: text('properties'),
    timestamp: integer('timestamp'),
});

export const reports = pgTable('reports', {
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

// ─── Pilot Tables ────────────────────────────────────────────────────────────

export const orgs = pgTable('orgs', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  slug:      text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id:           text('id').primaryKey(),
  orgId:        text('org_id').notNull().references(() => orgs.id),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName:     text('full_name').notNull(),
  role:         text('role').notNull(),
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id:         text('id').primaryKey(),
  orgId:      text('org_id').references(() => orgs.id),
  userId:     text('user_id').references(() => users.id),
  action:     text('action').notNull(),
  entityType: text('entity_type'),
  entityId:   text('entity_id'),
  metadata:   jsonb('metadata'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Pilot Relations ──────────────────────────────────────────────────────────

export const orgsRelations = relations(orgs, ({ many }) => ({
  users:     many(users),
  auditLogs: many(auditLog),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org:       one(orgs, { fields: [users.orgId], references: [orgs.id] }),
  auditLogs: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  org:  one(orgs,  { fields: [auditLog.orgId],  references: [orgs.id] }),
  user: one(users, { fields: [auditLog.userId], references: [users.id] }),
}));
