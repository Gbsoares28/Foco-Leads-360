import crypto from 'crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  businesses,
  commercialScripts,
  minisites,
  operatorSettings,
  opportunities,
  prospectingSearches,
  qrCodes,
} from './schema.ts';
import { DEFAULT_COMMERCIAL_SCRIPTS } from '../lib/default-scripts.ts';

export const CRM_STAGES = [
  { id: 'novo', label: 'Novo' },
  { id: 'chamado', label: 'Chamado' },
  { id: 'respondeu', label: 'Responderam' },
  { id: 'negociando', label: 'Negociando' },
  { id: 'fechou', label: 'Fechou' },
  { id: 'perdido', label: 'Perdido' },
] as const;

export type CrmStage = (typeof CRM_STAGES)[number]['id'];

// ---- PROSPECTING ----

export async function getMonthlyProspectingUsage(profileId?: number | null) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const conditions = [gte(prospectingSearches.createdAt, startOfMonth)];
  if (profileId) {
    conditions.push(eq(prospectingSearches.createdBy, profileId));
  }

  const [res] = await db
    .select({
      used: sql<number>`coalesce(sum(${prospectingSearches.requestsUsed}), 0)`,
    })
    .from(prospectingSearches)
    .where(and(...conditions));

  const monthlyLimit = 30;
  const used = Number(res?.used ?? 0);
  return {
    used,
    limit: monthlyLimit,
    remaining: Math.max(0, monthlyLimit - used),
  };
}

export async function saveProspectingSearch(params: {
  country: string;
  state: string;
  city: string;
  niche: string;
  neighborhoods: string;
  requestsUsed: number;
  results: Array<Record<string, unknown>>;
  isDemo: boolean;
  actorId: number | null;
}) {
  const [inserted] = await db
    .insert(prospectingSearches)
    .values({
      country: params.country,
      state: params.state,
      city: params.city,
      niche: params.niche,
      neighborhoods: params.neighborhoods,
      requestsUsed: params.requestsUsed,
      resultsCount: params.results.length,
      results: params.results,
      isDemo: params.isDemo,
      createdBy: params.actorId,
    })
    .returning();
  return inserted;
}

export async function listProspectingSearches(isDemo: boolean) {
  return await db
    .select()
    .from(prospectingSearches)
    .where(eq(prospectingSearches.isDemo, isDemo))
    .orderBy(desc(prospectingSearches.createdAt))
    .limit(10);
}

// ---- CRM / PAINEL DE LEADS ----

export async function listCrmLeads(isDemo: boolean) {
  const rows = await db
    .select({
      id: opportunities.id,
      businessId: opportunities.businessId,
      minisiteId: opportunities.minisiteId,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      serviceName: opportunities.serviceName,
      leadScore: opportunities.leadScore,
      competitorName: opportunities.competitorName,
      competitorReviews: opportunities.competitorReviews,
      gapReviews: opportunities.gapReviews,
      notes: opportunities.notes,
      createdAt: opportunities.createdAt,
      updatedAt: opportunities.updatedAt,
      businessName: businesses.name,
      businessCategory: businesses.category,
      businessCity: businesses.city,
      businessPhone: businesses.phone,
      businessWhatsapp: businesses.whatsapp,
      businessWebsite: businesses.website,
      businessMapsUrl: businesses.googleMapsUrl,
      businessMetadata: businesses.sourceMetadata,
      minisiteSlug: minisites.slug,
      minisiteViews: minisites.viewsCount,
      minisiteStatus: minisites.status,
    })
    .from(opportunities)
    .innerJoin(businesses, eq(opportunities.businessId, businesses.id))
    .leftJoin(minisites, eq(opportunities.minisiteId, minisites.id))
    .where(eq(opportunities.isDemo, isDemo))
    .orderBy(desc(opportunities.updatedAt));

  return rows;
}

export async function createCrmLead(params: {
  businessId: number;
  minisiteId?: number | null;
  stage?: string;
  estimatedValue?: number;
  serviceName?: string;
  leadScore?: number;
  competitorName?: string;
  competitorReviews?: number;
  gapReviews?: number;
  notes?: string;
  isDemo: boolean;
  actorId: number | null;
}) {
  const [inserted] = await db
    .insert(opportunities)
    .values({
      businessId: params.businessId,
      minisiteId: params.minisiteId ?? null,
      assignedTo: params.actorId,
      stage: params.stage || 'novo',
      estimatedValue: params.estimatedValue ?? 0,
      serviceName: params.serviceName || 'Minisite comercial',
      leadScore: params.leadScore ?? 0,
      competitorName: params.competitorName || '',
      competitorReviews: params.competitorReviews ?? 0,
      gapReviews: params.gapReviews ?? 0,
      notes: params.notes || '',
      isDemo: params.isDemo,
    })
    .returning();

  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: 'crm.lead_created',
    entityType: 'opportunity',
    entityId: String(inserted.id),
    metadata: { businessId: params.businessId, stage: inserted.stage },
  });

  return inserted;
}

export async function updateCrmLead(params: {
  id: number;
  stage?: string;
  estimatedValue?: number;
  notes?: string;
  minisiteId?: number | null;
  actorId: number;
}) {
  const updates: Partial<typeof opportunities.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof params.stage === 'string') updates.stage = params.stage;
  if (typeof params.estimatedValue === 'number') updates.estimatedValue = params.estimatedValue;
  if (typeof params.notes === 'string') updates.notes = params.notes;
  if (params.minisiteId !== undefined) updates.minisiteId = params.minisiteId;

  const [updated] = await db
    .update(opportunities)
    .set(updates)
    .where(eq(opportunities.id, params.id))
    .returning();

  if (!updated) return null;

  if (typeof params.stage === 'string') {
    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action: 'crm.lead_stage_changed',
      entityType: 'opportunity',
      entityId: String(params.id),
      metadata: { stage: params.stage },
    });
  }

  return updated;
}

export async function deleteCrmLead(id: number) {
  const [deleted] = await db
    .delete(opportunities)
    .where(eq(opportunities.id, id))
    .returning();
  return deleted || null;
}

// ---- QR CODES DINÂMICOS ----

export async function listQrCodes(isDemo: boolean) {
  return await db
    .select({
      id: qrCodes.id,
      code: qrCodes.code,
      label: qrCodes.label,
      destinationType: qrCodes.destinationType,
      destinationUrl: qrCodes.destinationUrl,
      businessId: qrCodes.businessId,
      minisiteId: qrCodes.minisiteId,
      scansCount: qrCodes.scansCount,
      active: qrCodes.active,
      isDemo: qrCodes.isDemo,
      createdAt: qrCodes.createdAt,
      updatedAt: qrCodes.updatedAt,
      businessName: businesses.name,
      minisiteSlug: minisites.slug,
    })
    .from(qrCodes)
    .leftJoin(businesses, eq(qrCodes.businessId, businesses.id))
    .leftJoin(minisites, eq(qrCodes.minisiteId, minisites.id))
    .where(eq(qrCodes.isDemo, isDemo))
    .orderBy(desc(qrCodes.createdAt));
}

export async function createQrCode(params: {
  label: string;
  destinationType: string;
  destinationUrl: string;
  businessId?: number | null;
  minisiteId?: number | null;
  isDemo: boolean;
  actorId: number | null;
}) {
  const shortCode = crypto.randomBytes(4).toString('hex');
  const [inserted] = await db
    .insert(qrCodes)
    .values({
      code: shortCode,
      label: params.label,
      destinationType: params.destinationType,
      destinationUrl: params.destinationUrl,
      businessId: params.businessId ?? null,
      minisiteId: params.minisiteId ?? null,
      active: true,
      scansCount: 0,
      isDemo: params.isDemo,
      createdBy: params.actorId,
    })
    .returning();

  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: 'qrcode.created',
    entityType: 'qr_code',
    entityId: String(inserted.id),
    metadata: { code: shortCode, label: params.label },
  });

  return inserted;
}

export async function updateQrCode(params: {
  id: number;
  label?: string;
  destinationType?: string;
  destinationUrl?: string;
  active?: boolean;
}) {
  const updates: Partial<typeof qrCodes.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof params.label === 'string') updates.label = params.label;
  if (typeof params.destinationType === 'string') updates.destinationType = params.destinationType;
  if (typeof params.destinationUrl === 'string') updates.destinationUrl = params.destinationUrl;
  if (typeof params.active === 'boolean') updates.active = params.active;

  const [updated] = await db
    .update(qrCodes)
    .set(updates)
    .where(eq(qrCodes.id, params.id))
    .returning();
  return updated || null;
}

export async function deleteQrCode(id: number) {
  const [deleted] = await db.delete(qrCodes).where(eq(qrCodes.id, id)).returning();
  return deleted || null;
}

export async function resolveAndTrackQrCode(code: string) {
  const [record] = await db
    .select()
    .from(qrCodes)
    .where(eq(qrCodes.code, code))
    .limit(1);

  if (!record || !record.active) {
    return null;
  }

  await db
    .update(qrCodes)
    .set({ scansCount: sql`${qrCodes.scansCount} + 1` })
    .where(eq(qrCodes.id, record.id));

  return record;
}

// ---- SCRIPTS COMERCIAIS ----

export async function ensureDefaultScripts() {
  const existing = await db.select({ id: commercialScripts.id }).from(commercialScripts).limit(1);
  if (existing.length > 0) return;

  await db.insert(commercialScripts).values(
    DEFAULT_COMMERCIAL_SCRIPTS.map((s) => ({
      stageKey: s.stageKey,
      stageOrder: s.stageOrder,
      stageTitle: s.stageTitle,
      title: s.title,
      body: s.body,
      isDefault: true,
    }))
  );
}

export async function listCommercialScripts() {
  await ensureDefaultScripts();
  return await db
    .select()
    .from(commercialScripts)
    .orderBy(commercialScripts.stageOrder, commercialScripts.id);
}

export async function createCommercialScript(params: {
  stageKey: string;
  stageOrder: number;
  stageTitle: string;
  title: string;
  body: string;
  actorId: number | null;
}) {
  const [inserted] = await db
    .insert(commercialScripts)
    .values({
      stageKey: params.stageKey,
      stageOrder: params.stageOrder,
      stageTitle: params.stageTitle,
      title: params.title,
      body: params.body,
      isDefault: false,
      createdBy: params.actorId,
    })
    .returning();
  return inserted;
}

export async function updateCommercialScript(params: {
  id: number;
  title: string;
  body: string;
}) {
  const [updated] = await db
    .update(commercialScripts)
    .set({
      title: params.title,
      body: params.body,
      updatedAt: new Date(),
    })
    .where(eq(commercialScripts.id, params.id))
    .returning();
  return updated || null;
}

export async function deleteCommercialScript(id: number) {
  const [deleted] = await db
    .delete(commercialScripts)
    .where(eq(commercialScripts.id, id))
    .returning();
  return deleted || null;
}

export async function restoreDefaultScripts() {
  await db.delete(commercialScripts);
  await db.insert(commercialScripts).values(
    DEFAULT_COMMERCIAL_SCRIPTS.map((s) => ({
      stageKey: s.stageKey,
      stageOrder: s.stageOrder,
      stageTitle: s.stageTitle,
      title: s.title,
      body: s.body,
      isDefault: true,
    }))
  );
  return await listCommercialScripts();
}

// ---- OPERATOR SETTINGS ----

export async function getOperatorSettings(profileId?: number | null) {
  if (!profileId) {
    return {
      operatorName: '',
      operatorCity: '',
      sitePriceLabel: 'R$ 97/mês',
      platePriceLabel: 'R$ 79,00',
      baseDomain: process.env.MINISITE_BASE_DOMAIN || 'linkfoco.vercel.app',
      whatsappConnected: false,
    };
  }
  const [row] = await db
    .select()
    .from(operatorSettings)
    .where(eq(operatorSettings.profileId, profileId))
    .limit(1);

  return (
    row || {
      operatorName: '',
      operatorCity: '',
      sitePriceLabel: 'R$ 97/mês',
      platePriceLabel: 'R$ 79,00',
      baseDomain: process.env.MINISITE_BASE_DOMAIN || 'linkfoco.vercel.app',
      whatsappConnected: false,
    }
  );
}

export async function upsertOperatorSettings(
  profileId: number,
  patch: {
    operatorName?: string;
    operatorCity?: string;
    sitePriceLabel?: string;
    platePriceLabel?: string;
    baseDomain?: string;
    whatsappConnected?: boolean;
  }
) {
  const existing = await db
    .select()
    .from(operatorSettings)
    .where(eq(operatorSettings.profileId, profileId))
    .limit(1);

  if (existing.length === 0) {
    const [inserted] = await db
      .insert(operatorSettings)
      .values({
        profileId,
        operatorName: patch.operatorName ?? '',
        operatorCity: patch.operatorCity ?? '',
        sitePriceLabel: patch.sitePriceLabel ?? 'R$ 97/mês',
        platePriceLabel: patch.platePriceLabel ?? 'R$ 79,00',
        baseDomain: patch.baseDomain ?? (process.env.MINISITE_BASE_DOMAIN || 'linkfoco.vercel.app'),
        whatsappConnected: patch.whatsappConnected ?? false,
      })
      .returning();
    return inserted;
  }

  const [updated] = await db
    .update(operatorSettings)
    .set({
      ...(typeof patch.operatorName === 'string' ? { operatorName: patch.operatorName } : {}),
      ...(typeof patch.operatorCity === 'string' ? { operatorCity: patch.operatorCity } : {}),
      ...(typeof patch.sitePriceLabel === 'string'
        ? { sitePriceLabel: patch.sitePriceLabel }
        : {}),
      ...(typeof patch.platePriceLabel === 'string'
        ? { platePriceLabel: patch.platePriceLabel }
        : {}),
      ...(typeof patch.baseDomain === 'string' ? { baseDomain: patch.baseDomain } : {}),
      ...(typeof patch.whatsappConnected === 'boolean'
        ? { whatsappConnected: patch.whatsappConnected }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(operatorSettings.profileId, profileId))
    .returning();

  return updated;
}
