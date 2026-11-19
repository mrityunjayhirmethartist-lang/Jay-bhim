export type AdminTab =
  | 'overview'
  | 'users'
  | 'releases'
  | 'finance'
  | 'subscriptions'
  | 'ai-center'
  | 'ai-automation'
  | 'distribution'
  | 'support'
  | 'website'
  | 'security'
  | 'health'
  | 'settings';

export interface SubMenuItem {
  id: string;
  label: string;
}

export interface NavCategory {
  id: AdminTab;
  label: string;
  shortLabel: string;
  submenus: SubMenuItem[];
}

export const ADMIN_NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'overview',
    label: 'Overview / Dashboard',
    shortLabel: 'Overview',
    submenus: [
      { id: 'executive-overview', label: 'Executive Overview' },
      { id: 'user-analytics', label: 'User Growth Analytics' },
      { id: 'release-analytics', label: 'Release Analytics' },
      { id: 'revenue-analytics', label: 'Revenue Analytics' },
      { id: 'platform-activity', label: 'Platform Activity' }
    ]
  },
  {
    id: 'users',
    label: 'User Management',
    shortLabel: 'Users',
    submenus: [
      { id: 'all-users', label: 'All Registered Users' },
      { id: 'artist-onboarding', label: 'Artist Onboarding Queue' },
      { id: 'incomplete-profiles', label: 'Incomplete Profiles' },
      { id: 'pending-profile-reviews', label: 'Pending Profile Reviews' },
      { id: 'approved-artists', label: 'Approved Artists' },
      { id: 'rejected-profiles', label: 'Rejected / Changes' },
      { id: 'kyc-pending', label: 'KYC Pending Review' },
      { id: 'kyc-approved', label: 'KYC Approved' },
      { id: 'kyc-rejected', label: 'KYC Rejected / Re-upload' },
      { id: 'kyc-history', label: 'All KYC Records' },
      { id: 'suspended-accounts', label: 'Suspended Accounts' },
      { id: 'terminated-accounts', label: 'Terminated Accounts' }
    ]
  },
  {
    id: 'releases',
    label: 'Music & Release Management',
    shortLabel: 'Releases',
    submenus: [
      { id: 'all-releases', label: 'All Music Releases' },
      { id: 'pending-releases', label: 'Pending Releases' },
      { id: 'approved-releases', label: 'Approved Releases' },
      { id: 'published-releases', label: 'Published / Live' },
      { id: 'rejected-releases', label: 'Rejected Releases' },
      { id: 'takedown-requests', label: 'Takedown Requests' },
      { id: 'release-history', label: 'Distribution History' }
    ]
  },
  {
    id: 'finance',
    label: 'Royalty & Finance',
    shortLabel: 'Finance',
    submenus: [
      { id: 'financial-overview', label: 'Financial Overview' },
      { id: 'financial-governance', label: 'Payouts & Governance' },
      { id: 'transactions', label: 'Transactions Ledger' },
      { id: 'failed-payments', label: 'Failed Payments' },
      { id: 'refund-requests', label: 'Refund Management' },
      { id: 'revenue-reports', label: 'Financial Reports' }
    ]
  },
  {
    id: 'subscriptions',
    label: 'Subscription Management',
    shortLabel: 'Subscriptions',
    submenus: [
      { id: 'active-subscriptions', label: 'Active Subscriptions' },
      { id: 'expired-subscriptions', label: 'Expired / Cancelled' },
      { id: 'pending-payments', label: 'Pending Plan Payments' },
      { id: 'subscription-history', label: 'Subscription History' },
      { id: 'promotional-program', label: 'First-10 Free Program' },
      { id: 'plan-pricing', label: 'Plan Pricing & Config' }
    ]
  },
  {
    id: 'ai-center',
    label: 'AI Control Centre',
    shortLabel: 'AI Control',
    submenus: [
      { id: 'ai-system-analysis', label: 'System Analysis & Alerts' },
      { id: 'pending-ai-reviews', label: 'Pending AI Reviews' },
      { id: 'release-analysis', label: 'Release Analysis' },
      { id: 'metadata-validation', label: 'Metadata & Audio QC' },
      { id: 'copyright-risk-analysis', label: 'Copyright Risk Analysis' },
      { id: 'ai-provider-settings', label: 'AI Engine & Models' },
      { id: 'ai-usage-costs', label: 'AI Usage & Token Logs' },
      { id: 'ai-permissions', label: 'AI Permissions' }
    ]
  },
  {
    id: 'ai-automation',
    label: 'AI Automation',
    shortLabel: 'Automation',
    submenus: [
      { id: 'automation-overview', label: 'AI Automation Dashboard' },
      { id: 'promo-campaigns', label: 'Promotional Email Automation' },
      { id: 'ticket-automation', label: 'AI Support Ticket Queue' },
      { id: 'automation-logs', label: 'AI Activity & Audit Logs' }
    ]
  },
  {
    id: 'distribution',
    label: 'Distribution Management',
    shortLabel: 'Distribution',
    submenus: [
      { id: 'delivery-overview', label: 'DSP Delivery Overview' },
      { id: 'dsp-partners', label: 'DSP Integrations Matrix' },
      { id: 'delivery-queue', label: 'Release Delivery Queue' },
      { id: 'held-deliveries', label: 'Held & Failed Deliveries' }
    ]
  },
  {
    id: 'support',
    label: 'Support & Complaints',
    shortLabel: 'Support',
    submenus: [
      { id: 'open-tickets', label: 'All Support Tickets' },
      { id: 'user-complaints', label: 'Complaints & Contact' },
      { id: 'platform-reviews', label: 'User Reviews' },
      { id: 'resolved-tickets', label: 'Resolved History' }
    ]
  },
  {
    id: 'website',
    label: 'Website Management',
    shortLabel: 'Website',
    submenus: [
      { id: 'announcements', label: 'Announcements & Banners' },
      { id: 'service-toggles', label: 'Service Module Toggles' },
      { id: 'seo-settings', label: 'SEO & Ads Configuration' },
      { id: 'maintenance-mode', label: 'Maintenance Mode' }
    ]
  },
  {
    id: 'security',
    label: 'Security & Permissions',
    shortLabel: 'Security',
    submenus: [
      { id: 'rbac-matrix', label: 'RBAC Permission Matrix' },
      { id: 'owner-approvals', label: 'Owner Approvals Queue' },
      { id: 'admin-sessions', label: 'Active Executive Sessions' },
      { id: 'audit-logs', label: 'Immutable Audit Logs' },
      { id: 'login-history', label: 'Login History' },
      { id: 'failed-logins', label: 'Failed Login Monitor' }
    ]
  },
  {
    id: 'health',
    label: 'System Health',
    shortLabel: 'Health',
    submenus: [
      { id: 'infra-overview', label: 'Runtime & API Health' },
      { id: 'database-status', label: 'Database & Storage' },
      { id: 'email-status', label: 'Email Relay & Queue' },
      { id: 'server-logs', label: 'Server Error Logs' },
      { id: 'infrastructure-backups', label: 'Backups & Exports' }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    submenus: [
      { id: 'general-settings', label: 'General Settings' },
      { id: 'chat-history', label: 'Chat History Management' },
      { id: 'user-permissions', label: 'User Permissions' },
      { id: 'privacy-security', label: 'Privacy & Security' },
      { id: 'ai-behaviour', label: 'AI Behaviour' },
      { id: 'email-notifications', label: 'Email & Notifications' },
      { id: 'support-management', label: 'Support Management' },
      { id: 'automation-approvals', label: 'Automation & Approvals' },
      { id: 'api-integrations', label: 'API & Integrations' },
      { id: 'account-management', label: 'Account Management' }
    ]
  }
];

export interface DataIntegrityMeta {
  dataSource: 'postgresql-live' | 'in-memory-fallback' | 'postgresql-error' | string;
  connectionStatus: 'connected' | 'in-memory' | 'error' | string;
  lastSyncedAt?: string;
  latencyMs?: number;
  includeTest?: boolean;
  excludedTestCounts?: {
    users: number;
    releases: number;
    orders: number;
    subscriptions: number;
  };
}

export interface OwnerApprovalProposalInput {
  actionType:
    | 'KYC_APPROVE'
    | 'KYC_REJECT'
    | 'KYC_REQUEST_REUPLOAD'
    | 'RELEASE_APPROVE'
    | 'RELEASE_REJECT'
    | 'RELEASE_REQUEST_CORRECTIONS'
    | 'RELEASE_PUBLISH'
    | 'RELEASE_METADATA_UPDATE'
    | 'USER_SUSPEND'
    | 'USER_TERMINATE'
    | 'USER_REACTIVATE'
    | 'SUBSCRIPTION_MANAGE'
    | 'PAYMENT_REFUND'
    | 'SETTINGS_UPDATE'
    | 'AI_SETTINGS_UPDATE'
    | 'PROFILE_APPROVE'
    | 'PROFILE_REJECT'
    | 'PROFILE_REQUEST_CHANGES'
    | 'PROMO_REVOKE'
    | 'PAYOUT_COMPLETE'
    | 'PAYOUT_REJECT';
  targetType: string;
  targetId: string;
  title: string;
  explanation: string;
  consequences: string;
  proposedChanges: Record<string, any>;
  payload: Record<string, any>;
  requiresReason?: boolean;
}

export interface ExecutiveSessionInfo {
  email: string;
  fullName: string;
  role: string;
  loginAt: string | null;
  lastActivityAt: string;
  expiresAt: string | null;
  securityStatus: string;
  databaseStatus: string;
  tokenHint: string;
}
