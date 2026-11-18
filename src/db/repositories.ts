import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  businesses,
  clients,
  financialEntries,
  generationJobs,
  minisiteBlocks,
  minisiteEvents,
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

export type ProfileRecord = typeof profiles.$inferSelect;

function sanitizeSlug(raw: string): string {
  const base = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'empresa-foco';
}

export async function generateUniqueSlug(title: string, isDemo: boolean): Promise<string> {
  try {
    const base = sanitizeSlug(title);
    const candidateBase = isDemo && !base.endsWith('-demo') ? `${base}-demo` : base;
    let candidate = candidateBase;
    let suffix = 1;

    while (suffix < 50) {
      const existing = await db
        .select({ id: minisites.id })
        .from(minisites)
        .where(eq(minisites.slug, candidate))
        .limit(1);
      if (existing.length === 0) {
        return candidate;
      }
      suffix += 1;
      candidate = `${candidateBase}-${suffix}`;
    }
    return `${candidateBase}-${Date.now().toString(36)}`;
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
    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.uid, params.uid))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(profiles)
        .set({
          email: params.email,
          fullName: params.fullName || existing[0].fullName,
        })
        .where(eq(profiles.uid, params.uid))
        .returning();
      return updated[0];
    }

    const totalCount = await db.select({ value: count() }).from(profiles);
    const isFirstUser = Number(totalCount[0]?.value ?? 0) === 0;
    const isOwnerEmail =
      params.email.toLowerCase() === 'gabrieltreinadordeanimais@gmail.com';
    const initialRole: UserRole =
      isFirstUser || isOwnerEmail ? 'administrador' : 'consultor_comercial';

    const inserted = await db
      .insert(profiles)
      .values({
        uid: params.uid,
        email: params.email,
        fullName: params.fullName,
        role: initialRole,
        active: true,
      })
      .onConflictDoUpdate({
        target: profiles.uid,
        set: { email: params.email },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Erro ao sincronizar perfil:', error);
    throw new Error('Falha ao carregar perfil do colaborador.', { cause: error });
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
        createdAt: minisites.createdAt,
        updatedAt: minisites.updatedAt,
        businessName: businesses.name,
        businessCategory: businesses.category,
        businessCity: businesses.city,
        businessPhone: businesses.phone,
        businessWhatsapp: businesses.whatsapp,
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

    return {
      items: rows,
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

    return {
      ...record.minisite,
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
    const slug = await generateUniqueSlug(params.title, params.isDemo);

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

    const minisite = inserted[0];

    if (params.blocks.length > 0) {
      await db.insert(minisiteBlocks).values(
        params.blocks.map((block, index) => ({
          minisiteId: minisite.id,
          blockType: block.blockType,
          position: index,
          visible: block.visible,
          content: block.content,
        }))
      );
    }

    await db.insert(minisiteVersions).values({
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
    });

    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action: 'minisite.created',
      entityType: 'minisite',
      entityId: String(minisite.id),
      metadata: { slug: minisite.slug, status: minisite.status, isDemo: params.isDemo },
    });

    return minisite;
  } catch (error) {
    console.error('Erro ao criar minisite:', error);
    throw new Error('Não foi possível criar o minisite no banco de dados.', { cause: error });
  }
}

export async function updateMinisiteStatus(params: {
  minisiteId: number;
  status: MinisiteStatus;
  actorId: number;
}) {
  try {
    const current = await db
      .select()
      .from(minisites)
      .where(eq(minisites.id, params.minisiteId))
      .limit(1);

    if (current.length === 0) return null;

    const updatePayload: Partial<typeof minisites.$inferInsert> = {
      status: params.status,
      updatedAt: new Date(),
    };

    if (params.status === 'publicado') {
      updatePayload.publicationAuthorizedAt = new Date();
      updatePayload.publicationAuthorizedBy = params.actorId;
    }

    const updated = await db
      .update(minisites)
      .set(updatePayload)
      .where(eq(minisites.id, params.minisiteId))
      .returning();

    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action:
        params.status === 'publicado'
          ? 'minisite.published_official'
          : 'minisite.status_changed',
      entityType: 'minisite',
      entityId: String(params.minisiteId),
      metadata: { previousStatus: current[0].status, newStatus: params.status },
    });

    return updated[0];
  } catch (error) {
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
    if (params.slug && params.slug.trim() !== '' && params.slug.trim() !== existing.slug) {
      const candidate = sanitizeSlug(params.slug);
      const conflict = await db
        .select({ id: minisites.id })
        .from(minisites)
        .where(and(eq(minisites.slug, candidate), sql`${minisites.id} <> ${params.minisiteId}`))
        .limit(1);
      if (conflict.length > 0) {
        throw new Error(`O endereço "${candidate}" já está em uso por outro minisite.`);
      }
      finalSlug = candidate;
    }

    const updated = await db.transaction(async (tx) => {
      const [savedMinisite] = await tx
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
        metadata: { version: nextVersion, blocksCount: params.blocks.length },
      });

      return savedMinisite;
    });

    return await getMinisiteDetail({ id: updated.id, incrementViews: false });
  } catch (error) {
    console.error('Erro ao salvar edição completa do minisite:', error);
    if (error instanceof Error && error.message.includes('já está em uso')) {
      throw error;
    }
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
