import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const USER_ROLES = [
  'administrador',
  'gestor_comercial',
  'consultor_comercial',
  'operacional',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const MINISITE_STATUSES = [
  'rascunho',
  'demonstracao',
  'publicado',
  'desativado',
] as const;

export type MinisiteStatus = (typeof MINISITE_STATUSES)[number];

export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('consultor_comercial'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const businesses = pgTable(
  'businesses',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    city: text('city').default(''),
    neighborhood: text('neighborhood').default(''),
    state: text('state').default(''),
    address: text('address').default(''),
    phone: text('phone').default(''),
    whatsapp: text('whatsapp').default(''),
    website: text('website').default(''),
    instagram: text('instagram').default(''),
    googlePlaceId: text('google_place_id'),
    googleMapsUrl: text('google_maps_url'),
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().default({}),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_businesses_is_demo').on(table.isDemo),
    index('idx_businesses_google_place_id').on(table.googlePlaceId),
  ]
);

export const minisites = pgTable(
  'minisites',
  {
    id: serial('id').primaryKey(),
    businessId: integer('business_id')
      .references(() => businesses.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    status: text('status').notNull().default('rascunho'),
    templateId: text('template_id').notNull().default('modelo_generico'),
    theme: jsonb('theme').$type<Record<string, unknown>>().notNull().default({}),
    seo: jsonb('seo').$type<Record<string, unknown>>().notNull().default({}),
    publishedSnapshot: jsonb('published_snapshot').$type<Record<string, unknown> | null>(),
    publishedAt: timestamp('published_at'),
    viewsCount: integer('views_count').notNull().default(0),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    publicationAuthorizedAt: timestamp('publication_authorized_at'),
    publicationAuthorizedBy: integer('publication_authorized_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_minisites_slug').on(table.slug),
    index('idx_minisites_status').on(table.status),
    index('idx_minisites_is_demo').on(table.isDemo),
  ]
);

export const minisiteSlugAliases = pgTable(
  'minisite_slug_aliases',
  {
    id: serial('id').primaryKey(),
    minisiteId: integer('minisite_id')
      .references(() => minisites.id, { onDelete: 'cascade' })
      .notNull(),
    aliasSlug: text('alias_slug').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_minisite_slug_aliases_alias_slug').on(table.aliasSlug),
    index('idx_minisite_slug_aliases_minisite_id').on(table.minisiteId),
  ]
);

export const minisiteBlocks = pgTable(
  'minisite_blocks',
  {
    id: serial('id').primaryKey(),
    minisiteId: integer('minisite_id')
      .references(() => minisites.id, { onDelete: 'cascade' })
      .notNull(),
    blockType: text('block_type').notNull(),
    position: integer('position').notNull().default(0),
    visible: boolean('visible').notNull().default(true),
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_minisite_blocks_minisite_id').on(table.minisiteId)]
);

export const minisiteVersions = pgTable('minisite_versions', {
  id: serial('id').primaryKey(),
  minisiteId: integer('minisite_id')
    .references(() => minisites.id, { onDelete: 'cascade' })
    .notNull(),
  version: integer('version').notNull().default(1),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const minisiteEvents = pgTable('minisite_events', {
  id: serial('id').primaryKey(),
  minisiteId: integer('minisite_id')
    .references(() => minisites.id, { onDelete: 'cascade' })
    .notNull(),
  eventType: text('event_type').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const generationJobs = pgTable('generation_jobs', {
  id: serial('id').primaryKey(),
  minisiteId: integer('minisite_id').references(() => minisites.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),
  input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb('result').$type<Record<string, unknown>>(),
  attempts: integer('attempts').notNull().default(0),
  errorMessage: text('error_message'),
  createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const opportunities = pgTable('opportunities', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  minisiteId: integer('minisite_id').references(() => minisites.id, { onDelete: 'set null' }),
  assignedTo: integer('assigned_to').references(() => profiles.id, { onDelete: 'set null' }),
  stage: text('stage').notNull().default('novo'),
  estimatedValue: integer('estimated_value').notNull().default(0),
  serviceName: text('service_name').default(''),
  leadScore: integer('lead_score').notNull().default(0),
  competitorName: text('competitor_name').default(''),
  competitorReviews: integer('competitor_reviews').notNull().default(0),
  gapReviews: integer('gap_reviews').notNull().default(0),
  notes: text('notes').default(''),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const prospectingSearches = pgTable('prospecting_searches', {
  id: serial('id').primaryKey(),
  country: text('country').notNull().default('BR'),
  state: text('state').default(''),
  city: text('city').notNull(),
  niche: text('niche').notNull(),
  neighborhoods: text('neighborhoods').default(''),
  requestsUsed: integer('requests_used').notNull().default(1),
  resultsCount: integer('results_count').notNull().default(0),
  results: jsonb('results').$type<Array<Record<string, unknown>>>().notNull().default([]),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const qrCodes = pgTable(
  'qr_codes',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    label: text('label').notNull(),
    destinationType: text('destination_type').notNull().default('minisite'),
    destinationUrl: text('destination_url').notNull(),
    businessId: integer('business_id').references(() => businesses.id, { onDelete: 'set null' }),
    minisiteId: integer('minisite_id').references(() => minisites.id, { onDelete: 'set null' }),
    scansCount: integer('scans_count').notNull().default(0),
    active: boolean('active').notNull().default(true),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_qr_codes_code').on(table.code)]
);

export const commercialScripts = pgTable('commercial_scripts', {
  id: serial('id').primaryKey(),
  stageKey: text('stage_key').notNull(),
  stageOrder: integer('stage_order').notNull().default(1),
  stageTitle: text('stage_title').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: integer('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const operatorSettings = pgTable('operator_settings', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .unique(),
  operatorName: text('operator_name').default(''),
  operatorCity: text('operator_city').default(''),
  sitePriceLabel: text('site_price_label').default('R$ 97/mês'),
  platePriceLabel: text('plate_price_label').default('R$ 79,00'),
  baseDomain: text('base_domain').default('focoleads360.com.br'),
  whatsappConnected: boolean('whatsapp_connected').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id').references(() => opportunities.id, {
    onDelete: 'cascade',
  }),
  businessId: integer('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  assignedTo: integer('assigned_to').references(() => profiles.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  dueAt: timestamp('due_at'),
  status: text('status').notNull().default('pendente'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const proposals = pgTable('proposals', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id').references(() => opportunities.id, {
    onDelete: 'cascade',
  }),
  businessId: integer('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
  totalValue: integer('total_value').notNull().default(0),
  status: text('status').notNull().default('rascunho'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  status: text('status').notNull().default('ativo'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id')
    .references(() => clients.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('em_andamento'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const financialEntries = pgTable('financial_entries', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amount: integer('amount').notNull().default(0),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  status: text('status').notNull().default('pendente'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_audit_logs_created_at').on(table.createdAt)]
);

export const mediaAssets = pgTable('media_assets', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  dataBase64: text('data_base64').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const businessesRelations = relations(businesses, ({ many, one }) => ({
  minisites: many(minisites),
  opportunities: many(opportunities),
  creator: one(profiles, {
    fields: [businesses.createdBy],
    references: [profiles.id],
  }),
}));

export const minisitesRelations = relations(minisites, ({ one, many }) => ({
  business: one(businesses, {
    fields: [minisites.businessId],
    references: [businesses.id],
  }),
  blocks: many(minisiteBlocks),
  versions: many(minisiteVersions),
  events: many(minisiteEvents),
  slugAliases: many(minisiteSlugAliases),
}));

export const minisiteSlugAliasesRelations = relations(minisiteSlugAliases, ({ one }) => ({
  minisite: one(minisites, {
    fields: [minisiteSlugAliases.minisiteId],
    references: [minisites.id],
  }),
}));

export const minisiteBlocksRelations = relations(minisiteBlocks, ({ one }) => ({
  minisite: one(minisites, {
    fields: [minisiteBlocks.minisiteId],
    references: [minisites.id],
  }),
}));
