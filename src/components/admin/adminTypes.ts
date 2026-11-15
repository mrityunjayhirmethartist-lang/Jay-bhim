export type AdminTab =
  | 'overview'
  | 'ai-review'
  | 'ai-settings'
  | 'users'
  | 'kyc'
  | 'releases'
  | 'payments'
  | 'support'
  | 'audit'
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
    label: 'Overview & Analytics',
    shortLabel: 'Overview',
    submenus: [
      { id: 'executive-overview', label: 'Executive Overview' },
      { id: 'user-analytics', label: 'User Analytics' },
      { id: 'release-analytics', label: 'Release Analytics' },
      { id: 'revenue-analytics', label: 'Revenue Analytics' },
      { id: 'platform-activity', label: 'Platform Activity' }
    ]
  },
  {
    id: 'ai-review',
    label: 'AI Review Center',
    shortLabel: 'AI Review',
    submenus: [
      { id: 'pending-ai-reviews', label: 'Pending AI Reviews' },
      { id: 'release-analysis', label: 'Release Analysis' },
      { id: 'metadata-validation', label: 'Metadata Validation' },
      { id: 'audio-quality-analysis', label: 'Audio Quality Analysis' },
      { id: 'copyright-risk-analysis', label: 'Copyright Risk Analysis' },
      { id: 'review-history', label: 'Review History' }
    ]
  },
  {
    id: 'ai-settings',
    label: 'AI Configuration',
    shortLabel: 'AI Config',
    submenus: [
      { id: 'ai-provider-settings', label: 'AI Provider Settings' },
      { id: 'api-configuration', label: 'API Configuration' },
      { id: 'model-selection', label: 'Model Selection' },
      { id: 'agent-management', label: 'Agent Management' },
      { id: 'ai-usage-costs', label: 'AI Usage & Costs' },
      { id: 'ai-permissions', label: 'AI Permissions' }
    ]
  },
  {
    id: 'users',
    label: 'User Management',
    shortLabel: 'Users',
    submenus: [
      { id: 'all-users', label: 'All Users' },
      { id: 'artist-accounts', label: 'Artist Accounts' },
      { id: 'new-registrations', label: 'New Registrations' },
      { id: 'suspended-accounts', label: 'Suspended Accounts' },
      { id: 'terminated-accounts', label: 'Terminated Accounts' },
      { id: 'user-activity', label: 'User Activity' }
    ]
  },
  {
    id: 'kyc',
    label: 'KYC Verification',
    shortLabel: 'KYC',
    submenus: [
      { id: 'pending-verification', label: 'Pending Verification' },
      { id: 'approved-kyc', label: 'Approved KYC' },
      { id: 'rejected-kyc', label: 'Rejected KYC' },
      { id: 'verification-history', label: 'Verification History' }
    ]
  },
  {
    id: 'releases',
    label: 'Release Management',
    shortLabel: 'Releases',
    submenus: [
      { id: 'all-releases', label: 'All Releases' },
      { id: 'pending-releases', label: 'Pending Releases' },
      { id: 'approved-releases', label: 'Approved Releases' },
      { id: 'rejected-releases', label: 'Rejected Releases' },
      { id: 'published-releases', label: 'Published Releases' },
      { id: 'takedown-requests', label: 'Takedown Requests' },
      { id: 'release-history', label: 'Release History' }
    ]
  },
  {
    id: 'payments',
    label: 'Payments & Plans',
    shortLabel: 'Payments',
    submenus: [
      { id: 'payment-overview', label: 'Payment Overview' },
      { id: 'transactions', label: 'Transactions' },
      { id: 'failed-payments', label: 'Failed Payments' },
      { id: 'refund-requests', label: 'Refund Requests' },
      { id: 'subscription-plans', label: 'Subscription Plans' },
      { id: 'active-subscriptions', label: 'Active Subscriptions' },
      { id: 'revenue-reports', label: 'Revenue Reports' }
    ]
  },
  {
    id: 'support',
    label: 'Reviews & Support',
    shortLabel: 'Support',
    submenus: [
      { id: 'support-tickets', label: 'Support Tickets' },
      { id: 'user-complaints', label: 'User Complaints' },
      { id: 'platform-reviews', label: 'Platform Reviews' },
      { id: 'ai-suggested-responses', label: 'AI Suggested Responses' },
      { id: 'resolved-tickets', label: 'Resolved Tickets' }
    ]
  },
  {
    id: 'audit',
    label: 'Audit & Security Logs',
    shortLabel: 'Security',
    submenus: [
      { id: 'admin-activity', label: 'Admin Activity' },
      { id: 'login-history', label: 'Login History' },
      { id: 'security-events', label: 'Security Events' },
      { id: 'api-logs', label: 'API Logs' },
      { id: 'database-events', label: 'Database Events' },
      { id: 'permission-changes', label: 'Permission Changes' }
    ]
  },
  {
    id: 'settings',
    label: 'Platform Settings',
    shortLabel: 'Settings',
    submenus: [
      { id: 'general-settings', label: 'General Settings' },
      { id: 'branding', label: 'Branding' },
      { id: 'email-configuration', label: 'Email Configuration' },
      { id: 'smtp-status', label: 'SMTP Status' },
      { id: 'storage-configuration', label: 'Storage Configuration' },
      { id: 'payment-gateway', label: 'Payment Gateway' },
      { id: 'api-integrations', label: 'API Integrations' },
      { id: 'maintenance-mode', label: 'Maintenance Mode' }
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
    | 'USER_SUSPEND'
    | 'USER_TERMINATE'
    | 'USER_REACTIVATE'
    | 'PAYMENT_REFUND'
    | 'SETTINGS_UPDATE'
    | 'AI_SETTINGS_UPDATE';
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
