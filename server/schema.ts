import { pgTable, text, integer, real, boolean, primaryKey, timestamp, jsonb, uuid, bigint } from 'drizzle-orm/pg-core';
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
    name: text('name'),
    status: text('status').default('Draft'),
    // Workspace ownership (migration 006):
    // NULL  = personal workspace study
    // set   = organization workspace study
    organizationId: text('organization_id').references(() => orgs.id, { onDelete: 'set null' }),
    // Study creator (migration 007):
    // NULL  = legacy study (pre-ownership, visible to all for backward compat)
    // set   = user who created this study
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    // Admin review copy (migration 008):
    // NULL  = original study
    // set   = this is a review copy; points to the original study id
    parentStudyId: text('parent_study_id').references((): any => studies.id, { onDelete: 'set null' }),
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
    currentImage: text('current_image'),
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
    timestamp: bigint('timestamp', { mode: 'number' }),
});

export const implants = pgTable('implants', {
    id: text('id').primaryKey(),
    contextId: text('context_id').notNull().references(() => contexts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    fragmentId: text('fragment_id'),
    position: text('position'),
    angle: real('angle'),
    properties: text('properties'),
    timestamp: bigint('timestamp', { mode: 'number' }),
});

export const reports = pgTable('reports', {
    id: text('id').primaryKey(),
    visitId: text('visit_id').notNull().references(() => visits.id, { onDelete: 'cascade' }),
    studyId: text('study_id').references(() => studies.id, { onDelete: 'cascade' }),
    version: integer('version').default(1),
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
    org: one(orgs, { fields: [studies.organizationId], references: [orgs.id] }),
    owner: one(users, { fields: [studies.ownerUserId], references: [users.id] }),
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
  id:                text('id').primaryKey(),
  name:              text('name').notNull(),
  slug:              text('slug').notNull().unique(),
  organizationEmail: text('organization_email').notNull().unique(),
  createdBy:         text('created_by'),                             // FK set after users table is defined
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id:               text('id').primaryKey(),
  orgId:            text('org_id').references(() => orgs.id),  // nullable: kept for backward compatibility
  email:            text('email').notNull().unique(),
  passwordHash:     text('password_hash').notNull(),
  fullName:         text('full_name'),                          // nullable: set during profile completion
  role:             text('role').notNull(),
  isActive:         boolean('is_active').notNull().default(true),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // OTP onboarding columns
  isEmailVerified:  boolean('is_email_verified').notNull().default(false),
  emailVerifiedAt:  timestamp('email_verified_at', { withTimezone: true }),
  profileCompleted: boolean('profile_completed').notNull().default(false),
  designation:      text('designation'),
  country:          text('country'),
  avatarUrl:        text('avatar_url'),
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

export const orgsRelations = relations(orgs, ({ one, many }) => ({
  creator:      one(users, { fields: [orgs.createdBy], references: [users.id] }),
  users:        many(users),
  memberships:  many(organizationMemberships),
  studies:      many(studies),
  auditLogs:    many(auditLog),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org:          one(orgs, { fields: [users.orgId], references: [orgs.id] }),
  memberships:  many(organizationMemberships),
  ownedStudies: many(studies),
  auditLogs:    many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  org:  one(orgs,  { fields: [auditLog.orgId],  references: [orgs.id] }),
  user: one(users, { fields: [auditLog.userId], references: [users.id] }),
}));

// ─── Multi-org Membership Table ──────────────────────────────────────────────

export const organizationMemberships = pgTable('organization_memberships', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId:     text('org_id').notNull().references(() => orgs.id,   { onDelete: 'cascade' }),
  role:      text('role').notNull().default('viewer'),
  // status (migration 005): 'active' | 'removed' | 'blacklisted'
  // Membership row is NEVER deleted — retained for audit/history.
  status:    text('status').notNull().default('active'),
  joinedAt:  timestamp('joined_at',  { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── OTP Onboarding Tables ────────────────────────────────────────────────────

export const emailVerificationOtps = pgTable('email_verification_otps', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  otpHash:   text('otp_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt:    timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orgInvitations = pgTable('org_invitations', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  invitedEmail: text('invited_email').notNull(),
  role:         text('role').notNull().default('viewer'),
  status:       text('status').notNull().default('pending'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt:   timestamp('accepted_at', { withTimezone: true }),
});

export const otpAttemptLog = pgTable('otp_attempt_log', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  succeeded:   boolean('succeeded').notNull().default(false),
});

// ─── OTP Onboarding Relations ─────────────────────────────────────────────────

export const emailVerificationOtpsRelations = relations(emailVerificationOtps, ({ one }) => ({
  user: one(users, { fields: [emailVerificationOtps.userId], references: [users.id] }),
}));

export const orgInvitationsRelations = relations(orgInvitations, ({ one }) => ({
  org: one(orgs, { fields: [orgInvitations.orgId], references: [orgs.id] }),
}));

export const otpAttemptLogRelations = relations(otpAttemptLog, ({ one }) => ({
  user: one(users, { fields: [otpAttemptLog.userId], references: [users.id] }),
}));

// ─── Multi-org Membership Relations ──────────────────────────────────────────

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  user: one(users, { fields: [organizationMemberships.userId], references: [users.id] }),
  org:  one(orgs,  { fields: [organizationMemberships.orgId],  references: [orgs.id]  }),
}));
