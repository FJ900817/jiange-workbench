/** `sidebar` namespace dictionaries: shell controls (brand row, New Session, fold toggle). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
  'workspace.panel': 'AI Workspace 一级入口',
  'workspace.heading': 'AI Workspace',
  'workspace.command': '总控',
  'workspace.projects': '项目',
  'workspace.work': '工作台',
  'workspace.studios': '创作工作室',
  'workspace.radar': '资讯雷达',
  'library.label': 'Library',
  'library.placeholder': 'Library 尚未开放',
  'system.status': '系统状态与更新',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'workspace.panel': 'AI Workspace navigation',
  'workspace.heading': 'AI Workspace',
  'workspace.command': 'Overview',
  'workspace.projects': 'Portfolio',
  'workspace.work': 'Production',
  'workspace.studios': 'Creative',
  'workspace.radar': 'Signals',
  'library.label': 'Library',
  'library.placeholder': 'Library is not available yet',
  'system.status': 'System status and updates',
} satisfies Record<SidebarKey, string>
