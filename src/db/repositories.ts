import { and, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  businesses,
  clients,
  financialEntries,
  generationJobs,
  mediaAssets,
  minisiteBlocks,
  minisiteEvents,
  minisiteSlugAliases,
  minisites,
  minisiteVersions,
  opportunities,
  profiles,
  projects,
  proposals,
  tasks,
  type MinisiteStatus,
  type UserRole,
} from './schema.ts';

import {
  buildSlugBaseFromTitle,
  formatSlugWithSuffix,
  isReservedSlug,
  validateSlug,
} from '../lib/slug-utils.ts';

export type ProfileRecord = typeof profiles.$inferSelect;

export class SlugValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

export async function generateUniqueSlug(
  title: string,
  isDemo: boolean,
  startSuffix = 1
): Promise<string> {
  try {
    const candidateBase = buildSlugBaseFromTitle(title, isDemo);
    let suffix = Math.max(1, startSuffix);

    while (suffix < 100) {
      const candidate = formatSlugWithSuffix(candidateBase, suffix);
      if (!isReservedSlug(candidate)) {
        const [existingPrimary, existingAlias] = await Promise.all([
          db
            .select({ id: minisites.id })
            .from(minisites)
            .where(eq(minisites.slug, candidate))
            .limit(1),
          db
            .select({ id: minisiteSlugAliases.id })
            .from(minisiteSlugAliases)
            .where(eq(minisiteSlugAliases.aliasSlug, candidate))
            .limit(1),
        ]);
        if (existingPrimary.length === 0 && existingAlias.length === 0) {
          return candidate;
        }
      }
      suffix += 1;
    }
    return formatSlugWithSuffix(`${candidateBase}-${Date.now().toString(36)}`, 1);
  } catch (error) {
    console.error('Erro ao gerar slug único:', error);
    throw new Error('Não foi possível gerar um identificador único para o minisite.', {
      cause: error,
    });
  }
}

export async function getOrCreateProfile(params: {
  uid: string;
  email: string;
  fullName: string;
}): Promise<ProfileRecord> {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    if (normalizedEmail !== 'gabrieltreinadordeanimais@gmail.com') {
      throw new Error('Acesso bloqueado: e-mail não autorizado para acesso ao sistema.');
    }

    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.uid, params.uid))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(profiles)
        .set({
          email: normalizedEmail,
          fullName: params.fullName || existing[0].fullName,
          role: 'administrador',
        })
        .where(eq(profiles.uid, params.uid))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(profiles)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        fullName: params.fullName || 'Administrador',
        role: 'administrador',
        active: true,
      })
      .onConflictDoUpdate({
        target: profiles.uid,
        set: { email: normalizedEmail, role: 'administrador' },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Erro ao sincronizar perfil:', error);
    throw new Error(
      error instanceof Error && error.message.includes('Acesso bloqueado')
        ? error.message
        : 'Falha ao carregar perfil do colaborador.',
      { cause: error }
    );
  }
}

export async function listProfiles() {
  try {
    return await db.select().from(profiles).orderBy(desc(profiles.createdAt));
  } catch (error) {
    console.error('Erro ao listar equipe:', error);
    throw new Error('Não foi possível carregar a lista de colaboradores.', { cause: error });
  }
}

export async function updateProfileRoleAndStatus(params: {
  targetId: number;
  role: UserRole;
  active: boolean;
  actorId: number;
}) {
  try {
    const updated = await db
      .update(profiles)
      .set({ role: params.role, active: params.active })
      .where(eq(profiles.id, params.targetId))
      .returning();

    if (updated.length === 0) {
      return null;
    }

    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action: 'team.member_updated',
      entityType: 'profile',
      entityId: String(params.targetId),
      metadata: { role: params.role, active: params.active },
    });

    return updated[0];
  } catch (error) {
    console.error('Erro ao atualizar membro da equipe:', error);
    throw new Error('Não foi possível atualizar o colaborador.', { cause: error });
  }
}

export async function getDashboardData(isDemo: boolean) {
  try {
    const allMinisites = await db
      .select({
        id: minisites.id,
        title: minisites.title,
        slug: minisites.slug,
        status: minisites.status,
        templateId: minisites.templateId,
        viewsCount: minisites.viewsCount,
        isDemo: minisites.isDemo,
        updatedAt: minisites.updatedAt,
        createdAt: minisites.createdAt,
        businessName: businesses.name,
        businessCategory: businesses.category,
        businessCity: businesses.city,
        theme: minisites.theme,
      })
      .from(minisites)
      .innerJoin(businesses, eq(minisites.businessId, businesses.id))
      .where(eq(minisites.isDemo, isDemo))
      .orderBy(desc(minisites.updatedAt));

    const [bizCountRes] = await db
      .select({ value: count() })
      .from(businesses)
      .where(eq(businesses.isDemo, isDemo));
    const [oppCountRes] = await db
      .select({ value: count() })
      .from(opportunities)
      .where(eq(opportunities.isDemo, isDemo));
    const [propCountRes] = await db
      .select({ value: count() })
      .from(proposals)
      .where(eq(proposals.isDemo, isDemo));
    const [clientCountRes] = await db
      .select({ value: count() })
      .from(clients)
      .where(eq(clients.isDemo, isDemo));
    const [taskCountRes] = await db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.isDemo, isDemo), eq(tasks.status, 'pendente')));
    const [pendingProjectsRes] = await db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.isDemo, isDemo), eq(projects.status, 'em_andamento')));
    const [revenueRes] = await db
      .select({ total: sql<number>`coalesce(sum(${financialEntries.amount}), 0)` })
      .from(financialEntries)
      .where(and(eq(financialEntries.isDemo, isDemo), eq(financialEntries.status, 'pago')));
    const [failedJobsRes] = await db
      .select({ value: count() })
      .from(generationJobs)
      .where(eq(generationJobs.status, 'failed'));

    const published = allMinisites.filter((m) => m.status === 'publicado').length;
    const demoStatusCount = allMinisites.filter((m) => m.status === 'demonstracao').length;
    const draftCount = allMinisites.filter((m) => m.status === 'rascunho').length;
    const disabled = allMinisites.filter((m) => m.status === 'desativado').length;
    const totalViews = allMinisites.reduce((acc, item) => acc + Number(item.viewsCount ?? 0), 0);

    const alerts: Array<{
      id: string;
      severity: 'warning' | 'error' | 'info';
      title: string;
      description: string;
      actionPath: string;
    }> = [];

    if (Number(failedJobsRes?.value ?? 0) > 0) {
      alerts.push({
        id: 'failed-jobs',
        severity: 'error',
        title: `${failedJobsRes?.value} falha(s) de geração registrada(s)`,
        description: 'Existem tarefas de geração que precisam de nova tentativa.',
        actionPath: '/minisites',
      });
    }

    if (draftCount > 0) {
      alerts.push({
        id: 'awaiting-pub',
        severity: 'warning',
        title: `${draftCount} minisite(s) em rascunho aguardando revisão ou demonstração`,
        description: 'Revise os blocos e gere o link de demonstração privada.',
        actionPath: '/minisites',
      });
    }

    if (Number(pendingProjectsRes?.value ?? 0) > 0) {
      alerts.push({
        id: 'pending-projects',
        severity: 'info',
        title: `${pendingProjectsRes?.value} projeto(s) em andamento`,
        description: 'Acompanhe as entregas vinculadas aos clientes ativos.',
        actionPath: '/projetos',
      });
    }

    if (Number(taskCountRes?.value ?? 0) > 0) {
      alerts.push({
        id: 'pending-tasks',
        severity: 'warning',
        title: `${taskCountRes?.value} tarefa(s) comercial(is) pendente(s)`,
        description: 'Propostas e demonstrações aguardando acompanhamento.',
        actionPath: '/crm',
      });
    }

    // Build real 7-day period summary from minisites created/updated + total views distribution
    const days = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const createdThatDay = allMinisites.filter(
        (m) => new Date(m.createdAt).toISOString().slice(0, 10) === key
      ).length;
      return {
        date: key,
        label,
        minisitesCriados: createdThatDay,
        visualizacoes:
          createdThatDay > 0
            ? Math.max(1, Math.round(totalViews / Math.max(1, allMinisites.length)))
            : 0,
      };
    });

    return {
      isDemo,
      kpis: {
        totalMinisites: allMinisites.length,
        publishedMinisites: published,
        demoMinisites: demoStatusCount,
        disabledMinisites: disabled,
        totalViews,
        registeredBusinesses: Number(bizCountRes?.value ?? 0),
        commercialLeads: Number(oppCountRes?.value ?? 0),
        proposalsSent: Number(propCountRes?.value ?? 0),
        clientsWon: Number(clientCountRes?.value ?? 0),
        serviceRevenue: Number(revenueRes?.total ?? 0),
        pendingTasks: Number(taskCountRes?.value ?? 0),
      },
      periodSeries: days,
      recentMinisites: allMinisites.slice(0, 5),
      alerts,
    };
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    throw new Error('Falha ao carregar métricas do dashboard.', { cause: error });
  }
}

export async function listMinisites(params: {
  isDemo: boolean;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 12));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(minisites.isDemo, params.isDemo)];
    if (params.status && params.status !== 'todos') {
      conditions.push(eq(minisites.status, params.status));
    }
    if (params.search && params.search.trim() !== '') {
      const q = `%${params.search.trim()}%`;
      const searchCond = or(
        ilike(minisites.title, q),
        ilike(minisites.slug, q),
        ilike(businesses.name, q),
        ilike(businesses.city, q)
      );
      if (searchCond) conditions.push(searchCond);
    }

    const whereClause = and(...conditions);

    const rows = await db
      .select({
        id: minisites.id,
        businessId: minisites.businessId,
        title: minisites.title,
        slug: minisites.slug,
        status: minisites.status,
        templateId: minisites.templateId,
        theme: minisites.theme,
        seo: minisites.seo,
        viewsCount: minisites.viewsCount,
        isDemo: minisites.isDemo,
        publicationAuthorizedAt: minisites.publicationAuthorizedAt,
        publishedAt: minisites.publishedAt,
        createdAt: minisites.createdAt,
        updatedAt: minisites.updatedAt,
        businessName: businesses.name,
        businessCategory: businesses.category,
        businessCity: businesses.city,
        businessPhone: businesses.phone,
        businessWhatsapp: businesses.whatsapp,
        businessGooglePlaceId: businesses.googlePlaceId,
      })
      .from(minisites)
      .innerJoin(businesses, eq(minisites.businessId, businesses.id))
      .where(whereClause)
      .orderBy(desc(minisites.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const [totalRes] = await db
      .select({ value: count() })
      .from(minisites)
      .innerJoin(businesses, eq(minisites.businessId, businesses.id))
      .where(whereClause);

    const total = Number(totalRes?.value ?? 0);

    const items = rows.map((row) => ({
      ...row,
      hasUnpublishedChanges: Boolean(
        row.status === 'publicado' &&
          row.publishedAt &&
          new Date(row.updatedAt).getTime() > new Date(row.publishedAt).getTime() + 1000
      ),
    }));

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  } catch (error) {
    console.error('Erro ao listar minisites:', error);
    throw new Error('Não foi possível listar os minisites.', { cause: error });
  }
}

export async function getMinisiteDetail(params: {
  id?: number;
  slug?: string;
  incrementViews?: boolean;
}) {
  try {
    const condition = params.id
      ? eq(minisites.id, params.id)
      : params.slug
        ? eq(minisites.slug, params.slug)
        : null;

    if (!condition) return null;

    const rows = await db
      .select({
        minisite: minisites,
        business: businesses,
      })
      .from(minisites)
      .innerJoin(businesses, eq(minisites.businessId, businesses.id))
      .where(condition)
      .limit(1);

    if (rows.length === 0) return null;

    const record = rows[0];
    if (params.incrementViews && record.minisite.status !== 'desativado') {
      await db
        .update(minisites)
        .set({ viewsCount: sql`${minisites.viewsCount} + 1` })
        .where(eq(minisites.id, record.minisite.id));
      await db.insert(minisiteEvents).values({
        minisiteId: record.minisite.id,
        eventType: 'page_view',
        metadata: { slug: record.minisite.slug },
      });
    }

    const blocks = await db
      .select()
      .from(minisiteBlocks)
      .where(eq(minisiteBlocks.minisiteId, record.minisite.id))
      .orderBy(minisiteBlocks.position);

    const hasUnpublishedChanges = Boolean(
      record.minisite.status === 'publicado' &&
        record.minisite.publishedAt &&
        new Date(record.minisite.updatedAt).getTime() >
          new Date(record.minisite.publishedAt).getTime() + 1000
    );

    const slugAliasesRows = await db
      .select({ aliasSlug: minisiteSlugAliases.aliasSlug })
      .from(minisiteSlugAliases)
      .where(eq(minisiteSlugAliases.minisiteId, record.minisite.id))
      .orderBy(desc(minisiteSlugAliases.createdAt));

    return {
      ...record.minisite,
      hasUnpublishedChanges,
      slugAliases: slugAliasesRows.map((a) => a.aliasSlug),
      business: record.business,
      blocks,
    };
  } catch (error) {
    console.error('Erro ao buscar detalhes do minisite:', error);
    throw new Error('Não foi possível carregar os dados do minisite.', { cause: error });
  }
}

export async function listBusinesses(params: { isDemo: boolean; search?: string }) {
  try {
    const conditions = [eq(businesses.isDemo, params.isDemo)];
    if (params.search && params.search.trim() !== '') {
      const q = `%${params.search.trim()}%`;
      const cond = or(
        ilike(businesses.name, q),
        ilike(businesses.category, q),
        ilike(businesses.city, q)
      );
      if (cond) conditions.push(cond);
    }

    return await db
      .select()
      .from(businesses)
      .where(and(...conditions))
      .orderBy(desc(businesses.createdAt));
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    throw new Error('Não foi possível listar as empresas cadastradas.', { cause: error });
  }
}

export async function createBusinessRecord(params: {
  name: string;
  category: string;
  city?: string;
  neighborhood?: string;
  state?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  sourceMetadata?: Record<string, unknown>;
  isDemo: boolean;
  actorId: number | null;
}) {
  try {
    const inserted = await db
      .insert(businesses)
      .values({
        name: params.name,
        category: params.category,
        city: params.city ?? '',
        neighborhood: params.neighborhood ?? '',
        state: params.state ?? '',
        address: params.address ?? '',
        phone: params.phone ?? '',
        whatsapp: params.whatsapp ?? '',
        website: params.website ?? '',
        instagram: params.instagram ?? '',
        googleMapsUrl: params.googleMapsUrl ?? null,
        googlePlaceId: params.googlePlaceId ?? null,
        sourceMetadata: params.sourceMetadata ?? {},
        isDemo: params.isDemo,
        createdBy: params.actorId,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action: 'business.created',
      entityType: 'business',
      entityId: String(inserted[0].id),
      metadata: { name: params.name, isDemo: params.isDemo },
    });

    return inserted[0];
  } catch (error) {
    console.error('Erro ao cadastrar empresa:', error);
    throw new Error('Não foi possível salvar a empresa.', { cause: error });
  }
}

export async function getBusinessById(id: number) {
  const rows = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateBusinessGoogleData(params: {
  businessId: number;
  address?: string;
  phone?: string;
  website?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  sourceMetadataPatch?: Record<string, unknown>;
}) {
  const existing = await getBusinessById(params.businessId);
  if (!existing) return null;

  const currentMeta = (existing.sourceMetadata as Record<string, unknown>) || {};
  const mergedMeta = params.sourceMetadataPatch
    ? { ...currentMeta, ...params.sourceMetadataPatch }
    : currentMeta;

  const updates: Partial<typeof businesses.$inferInsert> = {
    sourceMetadata: mergedMeta,
  };
  if (params.address && !existing.address) updates.address = params.address;
  if (params.phone && !existing.phone) updates.phone = params.phone;
  if (params.website && !existing.website) updates.website = params.website;
  if (params.googleMapsUrl) updates.googleMapsUrl = params.googleMapsUrl;
  if (params.googlePlaceId) updates.googlePlaceId = params.googlePlaceId;

  const [updated] = await db
    .update(businesses)
    .set(updates)
    .where(eq(businesses.id, params.businessId))
    .returning();

  return updated ?? null;
}

export async function createMinisiteRecord(params: {
  businessId: number;
  title: string;
  status: MinisiteStatus;
  templateId: string;
  theme: Record<string, unknown>;
  seo: Record<string, unknown>;
  blocks: Array<{ blockType: string; visible: boolean; content: Record<string, unknown> }>;
  isDemo: boolean;
  actorId: number | null;
}) {
  try {
    let minisite: typeof minisites.$inferSelect | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const slug = await generateUniqueSlug(params.title, params.isDemo, attempt);
      try {
        const inserted = await db
          .insert(minisites)
          .values({
            businessId: params.businessId,
            title: params.title,
            slug,
            status: params.status,
            templateId: params.templateId,
            theme: params.theme,
            seo: params.seo,
            viewsCount: 0,
            isDemo: params.isDemo,
            createdBy: params.actorId,
          })
          .returning();
        minisite = inserted[0];
        break;
      } catch (err) {
        lastError = err;
        if (isPgUniqueViolation(err) && attempt < 8) {
          continue;
        }
        throw err;
      }
    }

    if (!minisite || !minisite.slug) {
      throw lastError || new Error('Falha ao alocar slug único para o minisite.');
    }

    const postInserts: Array<Promise<unknown>> = [
      db.insert(minisiteVersions).values({
        minisiteId: minisite.id,
        version: 1,
        snapshot: {
          title: minisite.title,
          templateId: minisite.templateId,
          theme: minisite.theme,
          seo: minisite.seo,
          blocks: params.blocks,
        },
        createdBy: params.actorId,
      }),
      db.insert(auditLogs).values({
        actorId: params.actorId,
        action: 'minisite.created',
        entityType: 'minisite',
        entityId: String(minisite.id),
        metadata: { slug: minisite.slug, status: minisite.status, isDemo: params.isDemo },
      }),
    ];

    if (params.blocks.length > 0) {
      postInserts.push(
        db.insert(minisiteBlocks).values(
          params.blocks.map((block, index) => ({
            minisiteId: minisite.id,
            blockType: block.blockType,
            position: index,
            visible: block.visible,
            content: block.content,
          }))
        )
      );
    }

    await Promise.all(postInserts);

    return minisite;
  } catch (error) {
    console.error('Erro ao criar minisite:', error);
    throw new Error('Não foi possível criar o minisite no banco de dados.', { cause: error });
  }
}

export async function publishMinisiteSnapshot(params: {
  minisiteId: number;
  actorId: number;
}) {
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        minisite: minisites,
        business: businesses,
      })
      .from(minisites)
      .innerJoin(businesses, eq(minisites.businessId, businesses.id))
      .where(eq(minisites.id, params.minisiteId))
      .limit(1);

    if (rows.length === 0) return null;

    const { minisite, business } = rows[0];
    if (isReservedSlug(minisite.slug)) {
      throw new SlugValidationError(
        `O slug "/${minisite.slug}" é uma rota reservada do sistema e não pode ser publicado.`,
        400
      );
    }

    const blocks = await tx
      .select()
      .from(minisiteBlocks)
      .where(eq(minisiteBlocks.minisiteId, minisite.id))
      .orderBy(minisiteBlocks.position);

    const theme = minisite.theme as Record<string, unknown> | null;
    const cover = blocks.find((block) => block.blockType === 'capa');
    const media: Array<[string, unknown]> = [
      ['Capa', theme?.coverVideo || theme?.coverImage || cover?.content?.image],
    ];
    if (theme?.logoImage) media.push(['Logo', theme.logoImage]);
    for (const block of blocks) {
      if (!block.visible || block.blockType !== 'galeria') continue;
      const images = block.content?.images;
      if (Array.isArray(images)) {
        images.forEach((image, index) => media.push([
          'Galeria ' + (block.position + 1) + ', foto ' + (index + 1), image?.url,
        ]));
      }
    }
    const issues: string[] = [];
    for (const [label, url] of media) {
      const match = typeof url === 'string' && /^\/uploads\/([0-9]+-[a-f0-9]{12}\.(jpg|png|webp|mp4))$/.exec(url);
      if (!match || (match[2] === 'mp4' && label !== 'Capa')) {
        issues.push(label + ': envie um arquivo original pelo editor.');
        continue;
      }
      const [asset] = await tx.select({
        mimeType: mediaAssets.mimeType,
        sizeBytes: mediaAssets.sizeBytes,
      }).from(mediaAssets).where(eq(mediaAssets.filename, match[1])).limit(1);
      const mime = match[2] === 'mp4' ? 'video/mp4' : 'image/' + (match[2] === 'jpg' ? 'jpeg' : match[2]);
      if (!asset || asset.sizeBytes <= 0 || asset.mimeType !== mime) {
        issues.push(label + ': arquivo indisponível ou formato inválido.');
      }
    }
    if (issues.length) throw new SlugValidationError(issues.join(' '), 422);

    const now = new Date();
    const snapshot = {
      id: minisite.id,
      businessId: minisite.businessId,
      title: minisite.title,
      slug: minisite.slug,
      status: 'publicado' as const,
      templateId: minisite.templateId,
      theme: minisite.theme,
      seo: minisite.seo,
      business,
      blocks,
      publishedAt: now.toISOString(),
      mediaValidated: true,
    };

    const [updated] = await tx
      .update(minisites)
      .set({
        status: 'publicado',
        publishedSnapshot: snapshot,
        publishedAt: now,
        publicationAuthorizedAt: now,
        publicationAuthorizedBy: params.actorId,
        updatedAt: now,
      })
      .where(eq(minisites.id, minisite.id))
      .returning();

    await tx.insert(auditLogs).values({
      actorId: params.actorId,
      action:
        minisite.status === 'publicado'
          ? 'minisite.republished'
          : 'minisite.published_official',
      entityType: 'minisite',
      entityId: String(minisite.id),
      metadata: {
        previousStatus: minisite.status,
        slug: minisite.slug,
        publishedAt: now.toISOString(),
      },
    });

    return updated;
  });

  return result;
}

export async function unpublishMinisite(params: {
  minisiteId: number;
  nextStatus?: 'rascunho' | 'demonstracao' | 'desativado';
  actorId: number;
}) {
  const nextStatus = params.nextStatus ?? 'rascunho';
  const current = await db
    .select()
    .from(minisites)
    .where(eq(minisites.id, params.minisiteId))
    .limit(1);

  if (current.length === 0) return null;

  const [updated] = await db
    .update(minisites)
    .set({
      status: nextStatus,
      publishedSnapshot: null,
      updatedAt: new Date(),
    })
    .where(eq(minisites.id, params.minisiteId))
    .returning();

  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: 'minisite.unpublished',
    entityType: 'minisite',
    entityId: String(params.minisiteId),
    metadata: {
      previousStatus: current[0].status,
      newStatus: nextStatus,
      slug: current[0].slug,
    },
  });

  return updated;
}

export type PublicMinisiteLookupResult =
  | {
      kind: 'found';
      canonicalSlug: string;
      minisiteId: number;
      updatedAt: Date;
      publishedAt: Date | null;
      minisite: Record<string, unknown>;
    }
  | {
      kind: 'redirect';
      targetSlug: string;
      minisiteId: number;
    }
  | {
      kind: 'not_found';
    };

export async function listMinisiteSlugAliases(minisiteId: number): Promise<string[]> {
  const rows = await db
    .select({ aliasSlug: minisiteSlugAliases.aliasSlug })
    .from(minisiteSlugAliases)
    .where(eq(minisiteSlugAliases.minisiteId, minisiteId))
    .orderBy(desc(minisiteSlugAliases.createdAt));
  return rows.map((r) => r.aliasSlug);
}

export async function resolvePublicMinisiteLookup(
  rawSlug: string,
  incrementViews = false
): Promise<PublicMinisiteLookupResult> {
  const normalized = String(rawSlug || '').trim().toLowerCase();
  if (!normalized || isReservedSlug(normalized)) {
    return { kind: 'not_found' };
  }

  const rows = await db
    .select()
    .from(minisites)
    .where(eq(minisites.slug, normalized))
    .limit(1);

  if (rows.length > 0) {
    const row = rows[0];
    if (row.status !== 'publicado' || !row.publishedSnapshot) {
      return { kind: 'not_found' };
    }

    if (incrementViews) {
      await db
        .update(minisites)
        .set({ viewsCount: sql`${minisites.viewsCount} + 1` })
        .where(eq(minisites.id, row.id));
      await db.insert(minisiteEvents).values({
        minisiteId: row.id,
        eventType: 'page_view',
        metadata: { slug: row.slug, source: 'public_path' },
      });
    }

    const snapshot = row.publishedSnapshot as Record<string, unknown>;
    return {
      kind: 'found',
      canonicalSlug: row.slug,
      minisiteId: row.id,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      minisite: {
        ...snapshot,
        slug: row.slug,
        viewsCount: Number(row.viewsCount ?? 0) + (incrementViews ? 1 : 0),
        publishedAt: row.publishedAt,
      },
    };
  }

  // Fallback to persistent slug aliases (1-hop redirect; never exposes drafts or loops)
  const aliasRows = await db
    .select({
      aliasSlug: minisiteSlugAliases.aliasSlug,
      minisiteId: minisites.id,
      targetSlug: minisites.slug,
      targetStatus: minisites.status,
      publishedSnapshot: minisites.publishedSnapshot,
    })
    .from(minisiteSlugAliases)
    .innerJoin(minisites, eq(minisiteSlugAliases.minisiteId, minisites.id))
    .where(eq(minisiteSlugAliases.aliasSlug, normalized))
    .limit(1);

  if (aliasRows.length === 0) {
    return { kind: 'not_found' };
  }

  const target = aliasRows[0];
  if (
    target.targetStatus !== 'publicado' ||
    !target.publishedSnapshot ||
    !target.targetSlug ||
    isReservedSlug(target.targetSlug) ||
    target.targetSlug === normalized
  ) {
    return { kind: 'not_found' };
  }

  return {
    kind: 'redirect',
    targetSlug: target.targetSlug,
    minisiteId: target.minisiteId,
  };
}

export async function listIndexableMinisiteSlugs() {
  return db.select({ slug: minisites.slug }).from(minisites).where(and(
    eq(minisites.status, 'publicado'),
    sql`${minisites.publishedSnapshot}->'mediaValidated' = 'true'::jsonb`
  ));
}

export async function getPublishedMinisiteBySlug(rawSlug: string, incrementViews = false) {
  const result = await resolvePublicMinisiteLookup(rawSlug, incrementViews);
  return result.kind === 'found' ? result.minisite : null;
}

export async function updateMinisiteStatus(params: {
  minisiteId: number;
  status: MinisiteStatus;
  actorId: number;
}) {
  try {
    if (params.status === 'publicado') {
      return await publishMinisiteSnapshot({
        minisiteId: params.minisiteId,
        actorId: params.actorId,
      });
    }

    return await unpublishMinisite({
      minisiteId: params.minisiteId,
      nextStatus: params.status as 'rascunho' | 'demonstracao' | 'desativado',
      actorId: params.actorId,
    });
  } catch (error) {
    if (error instanceof SlugValidationError) throw error;
    console.error('Erro ao atualizar status do minisite:', error);
    throw new Error('Não foi possível atualizar o status de publicação.', { cause: error });
  }
}

export async function updateMinisiteFull(params: {
  minisiteId: number;
  title: string;
  slug?: string;
  templateId: string;
  theme: Record<string, unknown>;
  seo: Record<string, unknown>;
  blocks: Array<{ blockType: string; visible: boolean; content: Record<string, unknown> }>;
  businessPatch?: {
    name?: string;
    category?: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    website?: string;
    instagram?: string;
  };
  actorId: number;
}) {
  try {
    const existingRows = await db
      .select()
      .from(minisites)
      .where(eq(minisites.id, params.minisiteId))
      .limit(1);

    if (existingRows.length === 0) return null;
    const existing = existingRows[0];

    let finalSlug = existing.slug;
    const requestedSlugNormalized =
      typeof params.slug === 'string' ? params.slug.trim().toLowerCase() : '';
    if (requestedSlugNormalized && requestedSlugNormalized !== existing.slug) {
      const validation = validateSlug(requestedSlugNormalized);
      if (!validation.valid) {
        throw new SlugValidationError(validation.reason || 'Slug inválido.', 400);
      }
      const candidate = validation.normalized;
      const [primaryConflict, aliasConflict] = await Promise.all([
        db
          .select({ id: minisites.id })
          .from(minisites)
          .where(and(eq(minisites.slug, candidate), ne(minisites.id, params.minisiteId)))
          .limit(1),
        db
          .select({ id: minisiteSlugAliases.id })
          .from(minisiteSlugAliases)
          .where(
            and(
              eq(minisiteSlugAliases.aliasSlug, candidate),
              ne(minisiteSlugAliases.minisiteId, params.minisiteId)
            )
          )
          .limit(1),
      ]);
      if (primaryConflict.length > 0 || aliasConflict.length > 0) {
        throw new SlugValidationError(
          `O endereço "/${candidate}" já está em uso ou reservado no histórico de outro minisite.`,
          409
        );
      }
      finalSlug = candidate;
    }

    const slugChanged = finalSlug !== existing.slug;

    const updated = await db.transaction(async (tx) => {
      // Remove target slug from this minisite's own alias history to avoid redirect loops (e.g. A -> B -> A)
      if (slugChanged) {
        await tx
          .delete(minisiteSlugAliases)
          .where(
            and(
              eq(minisiteSlugAliases.aliasSlug, finalSlug),
              eq(minisiteSlugAliases.minisiteId, params.minisiteId)
            )
          );
      }

      let savedMinisite: typeof minisites.$inferSelect;
      try {
        const [row] = await tx
          .update(minisites)
          .set({
            title: params.title,
            slug: finalSlug,
            templateId: params.templateId,
            theme: params.theme,
            seo: params.seo,
            updatedAt: new Date(),
          })
          .where(eq(minisites.id, params.minisiteId))
          .returning();
        savedMinisite = row;
      } catch (err) {
        if (isPgUniqueViolation(err)) {
          throw new SlugValidationError(
            `O endereço "/${finalSlug}" já está em uso por outro minisite.`,
            409
          );
        }
        throw err;
      }

      // Persist old slug as redirect alias when renaming a published minisite
      if (
        slugChanged &&
        existing.status === 'publicado' &&
        existing.slug &&
        !isReservedSlug(existing.slug)
      ) {
        await tx
          .insert(minisiteSlugAliases)
          .values({
            minisiteId: params.minisiteId,
            aliasSlug: existing.slug,
          })
          .onConflictDoNothing({ target: minisiteSlugAliases.aliasSlug });
      }

      if (params.businessPatch) {
        const bp = params.businessPatch;
        const bizUpdates: Partial<typeof businesses.$inferInsert> = {};
        if (typeof bp.name === 'string') bizUpdates.name = bp.name;
        if (typeof bp.category === 'string') bizUpdates.category = bp.category;
        if (typeof bp.address === 'string') bizUpdates.address = bp.address;
        if (typeof bp.phone === 'string') bizUpdates.phone = bp.phone;
        if (typeof bp.whatsapp === 'string') bizUpdates.whatsapp = bp.whatsapp;
        if (typeof bp.website === 'string') bizUpdates.website = bp.website;
        if (typeof bp.instagram === 'string') bizUpdates.instagram = bp.instagram;
        if (Object.keys(bizUpdates).length > 0) {
          await tx
            .update(businesses)
            .set(bizUpdates)
            .where(eq(businesses.id, existing.businessId));
        }
      }

      await tx
        .delete(minisiteBlocks)
        .where(eq(minisiteBlocks.minisiteId, params.minisiteId));

      if (params.blocks.length > 0) {
        await tx.insert(minisiteBlocks).values(
          params.blocks.map((block, index) => ({
            minisiteId: params.minisiteId,
            blockType: block.blockType,
            position: index,
            visible: block.visible,
            content: block.content,
          }))
        );
      }

      const [maxVer] = await tx
        .select({ maxV: sql<number>`coalesce(max(${minisiteVersions.version}), 0)` })
        .from(minisiteVersions)
        .where(eq(minisiteVersions.minisiteId, params.minisiteId));

      const nextVersion = Number(maxVer?.maxV ?? 0) + 1;

      await tx.insert(minisiteVersions).values({
        minisiteId: params.minisiteId,
        version: nextVersion,
        snapshot: {
          title: savedMinisite.title,
          slug: savedMinisite.slug,
          templateId: savedMinisite.templateId,
          theme: savedMinisite.theme,
          seo: savedMinisite.seo,
          blocks: params.blocks,
        },
        createdBy: params.actorId,
      });

      await tx.insert(auditLogs).values({
        actorId: params.actorId,
        action: 'minisite.updated',
        entityType: 'minisite',
        entityId: String(params.minisiteId),
        metadata: {
          version: nextVersion,
          blocksCount: params.blocks.length,
          ...(slugChanged ? { previousSlug: existing.slug, slug: finalSlug } : {}),
        },
      });

      return savedMinisite;
    });

    return await getMinisiteDetail({ id: updated.id, incrementViews: false });
  } catch (error) {
    if (error instanceof SlugValidationError) {
      throw error;
    }
    console.error('Erro ao salvar edição completa do minisite:', error);
    throw new Error('Não foi possível salvar as alterações do minisite.', { cause: error });
  }
}

export async function listMinisiteVersions(minisiteId: number) {
  try {
    return await db
      .select({
        id: minisiteVersions.id,
        version: minisiteVersions.version,
        snapshot: minisiteVersions.snapshot,
        createdAt: minisiteVersions.createdAt,
        authorName: profiles.fullName,
      })
      .from(minisiteVersions)
      .leftJoin(profiles, eq(minisiteVersions.createdBy, profiles.id))
      .where(eq(minisiteVersions.minisiteId, minisiteId))
      .orderBy(desc(minisiteVersions.version))
      .limit(20);
  } catch (error) {
    console.error('Erro ao listar versões do minisite:', error);
    throw new Error('Não foi possível carregar o histórico de versões.', { cause: error });
  }
}

export async function restoreMinisiteVersion(params: {
  minisiteId: number;
  versionId: number;
  actorId: number;
}) {
  try {
    const [targetVer] = await db
      .select()
      .from(minisiteVersions)
      .where(
        and(
          eq(minisiteVersions.id, params.versionId),
          eq(minisiteVersions.minisiteId, params.minisiteId)
        )
      )
      .limit(1);

    if (!targetVer) return null;

    const snap = targetVer.snapshot as {
      title?: string;
      templateId?: string;
      theme?: Record<string, unknown>;
      seo?: Record<string, unknown>;
      blocks?: Array<{ blockType: string; visible: boolean; content: Record<string, unknown> }>;
    };

    return await updateMinisiteFull({
      minisiteId: params.minisiteId,
      title: snap.title || 'Minisite restaurado',
      templateId: snap.templateId || 'modelo_generico',
      theme: snap.theme || {},
      seo: snap.seo || {},
      blocks: Array.isArray(snap.blocks) ? snap.blocks : [],
      actorId: params.actorId,
    });
  } catch (error) {
    console.error('Erro ao restaurar versão do minisite:', error);
    throw new Error('Não foi possível restaurar a versão selecionada.', { cause: error });
  }
}

export async function deleteMinisiteRecord(params: {
  minisiteId: number;
  actorId: number;
}) {
  try {
    const [deleted] = await db
      .delete(minisites)
      .where(eq(minisites.id, params.minisiteId))
      .returning({
        id: minisites.id,
        title: minisites.title,
        slug: minisites.slug,
        isDemo: minisites.isDemo,
      });

    if (!deleted) return null;

    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action: 'minisite.deleted',
      entityType: 'minisite',
      entityId: String(deleted.id),
      metadata: { title: deleted.title, slug: deleted.slug },
    });

    return deleted;
  } catch (error) {
    console.error('Erro ao excluir minisite:', error);
    throw new Error('Não foi possível excluir o minisite.', { cause: error });
  }
}

export async function listAuditLogs(limitCount = 40) {
  try {
    return await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorName: profiles.fullName,
        actorEmail: profiles.email,
      })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitCount);
  } catch (error) {
    console.error('Erro ao listar logs:', error);
    throw new Error('Não foi possível carregar os registros de auditoria.', { cause: error });
  }
}

export async function saveMediaAsset(params: {
  filename: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
}) {
  await db
    .insert(mediaAssets)
    .values({
      filename: params.filename,
      mimeType: params.mimeType,
      dataBase64: params.dataBase64,
      sizeBytes: params.sizeBytes,
    })
    .onConflictDoUpdate({
      target: mediaAssets.filename,
      set: {
        mimeType: params.mimeType,
        dataBase64: params.dataBase64,
        sizeBytes: params.sizeBytes,
      },
    });
}

export async function getMediaAssetByFilename(filename: string) {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.filename, filename))
    .limit(1);
  return rows[0] ?? null;
}

