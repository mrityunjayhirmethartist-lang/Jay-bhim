import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, NotificationItem } from '../types';
import { apiUrl } from '../utils/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  selectedPlanId: string | null;
  setSelectedPlanId: (planId: string | null) => void;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  notifications: NotificationItem[];
  activePopup: NotificationItem | null;
  dismissPopup: (notifId: string) => Promise<void>;
  markNotificationRead: (notifId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_TOKEN_KEY = 'rad_active_session_token';
const SESSION_PLAN_KEY = 'rad_selected_plan';
const LEGACY_STORAGE_KEYS = [
  'rad_token',
  'rad_refresh_token',
  'rad_user',
  'rad_selected_plan',
  'auth_token',
  'refresh_token',
  'token'
];

function purgeLegacyPersistentAuth(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

function readActiveSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeActiveSessionToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    purgeLegacyPersistentAuth();
    return readActiveSessionToken();
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPlanId, setSelectedPlanIdState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_PLAN_KEY);
    } catch {
      return null;
    }
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activePopup, setActivePopup] = useState<NotificationItem | null>(null);

  const setSelectedPlanId = (planId: string | null) => {
    setSelectedPlanIdState(planId);
    try {
      if (planId) {
        sessionStorage.setItem(SESSION_PLAN_KEY, planId);
      } else {
        sessionStorage.removeItem(SESSION_PLAN_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
  };

  // Verify ONLY current active browsing session (never auto-restore from persistent storage)
  useEffect(() => {
    purgeLegacyPersistentAuth();

    const verifySession = async () => {
      const activeToken = readActiveSessionToken();
      if (!activeToken) {
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(apiUrl('/api/auth/session'), {
          headers: { Authorization: `Bearer ${activeToken}` },
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
            setToken(activeToken);
          } else {
            writeActiveSessionToken(null);
            setToken(null);
            setUser(null);
          }
        } else {
          writeActiveSessionToken(null);
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Session verify failed:', err);
        writeActiveSessionToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        purgeLegacyPersistentAuth();
        if (!readActiveSessionToken()) {
          setToken(null);
          setUser(null);
          setNotifications([]);
          setActivePopup(null);
        } else {
          void verifySession();
        }
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const refreshNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/notifications'), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setActivePopup(data.activePopup || null);
      } else if (res.status === 401 || res.status === 403) {
        writeActiveSessionToken(null);
        setToken(null);
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  };

  useEffect(() => {
    if (user && token) {
      refreshNotifications();
      const interval = setInterval(refreshNotifications, 15000); // 15s poll
      return () => clearInterval(interval);
    }
  }, [user, token]);

  const login = (newToken: string, newUser: User) => {
    purgeLegacyPersistentAuth();
    writeActiveSessionToken(newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    const activeToken = token || readActiveSessionToken();
    purgeLegacyPersistentAuth();
    writeActiveSessionToken(null);
    setToken(null);
    setUser(null);
    setNotifications([]);
    setActivePopup(null);

    if (activeToken) {
      try {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeToken}` }
        });
      } catch (err) {
        console.error('Logout error', err);
      }
    }
  };

  const dismissPopup = async (notifId: string) => {
    setActivePopup(null);
    if (!token) return;
    try {
      await fetch(apiUrl(`/api/notifications/${notifId}/dismiss`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      refreshNotifications();
    } catch (err) {
      console.error('Dismiss popup error', err);
    }
  };

  const markNotificationRead = async (notifId: string) => {
    if (!token) return;
    try {
      await fetch(apiUrl(`/api/notifications/${notifId}/read`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      refreshNotifications();
    } catch (err) {
      console.error('Mark read error', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        selectedPlanId,
        setSelectedPlanId,
        login,
        logout,
        notifications,
        activePopup,
        dismissPopup,
        markNotificationRead,
        refreshNotifications
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
