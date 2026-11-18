import type { UserRole } from '../db/schema.ts';

export const ROLE_LABELS: Record<UserRole, string> = {
  administrador: 'Administrador',
  gestor_comercial: 'Gestor comercial',
  consultor_comercial: 'Consultor comercial',
  operacional: 'Operacional',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  administrador: 'Acesso completo, gestão da equipe e autorização de publicação oficial.',
  gestor_comercial: 'Prospecção, CRM, propostas, relatórios e minisites.',
  consultor_comercial: 'Empresas e oportunidades atribuídas, demonstrações e propostas.',
  operacional: 'Edição de minisites e projetos autorizados.',
};

export type Permission =
  | 'dashboard:read'
  | 'minisite:read'
  | 'minisite:create'
  | 'minisite:edit'
  | 'minisite:publish_official'
  | 'minisite:toggle_active'
  | 'business:read'
  | 'business:create'
  | 'team:manage'
  | 'logs:read';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  administrador: [
    'dashboard:read',
    'minisite:read',
    'minisite:create',
    'minisite:edit',
    'minisite:publish_official',
    'minisite:toggle_active',
    'business:read',
    'business:create',
    'team:manage',
    'logs:read',
  ],
  gestor_comercial: [
    'dashboard:read',
    'minisite:read',
    'minisite:create',
    'minisite:edit',
    'minisite:toggle_active',
    'business:read',
    'business:create',
    'logs:read',
  ],
  consultor_comercial: [
    'dashboard:read',
    'minisite:read',
    'minisite:create',
    'minisite:edit',
    'business:read',
    'business:create',
  ],
  operacional: [
    'dashboard:read',
    'minisite:read',
    'minisite:edit',
    'minisite:toggle_active',
    'business:read',
  ],
};

export function isValidRole(role: string): role is UserRole {
  return role in ROLE_PERMISSIONS;
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
