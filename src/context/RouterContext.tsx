import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface NavigateOptions {
  replace?: boolean;
}

interface RouterContextType {
  path: string;
  navigate: (to: string, options?: NavigateOptions) => void;
  queryParam: (key: string) => string | null;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const targetUrl = to.startsWith('/') ? to : `/${to}`;
    const cleanPath = targetUrl.split('?')[0].split('#')[0] || '/';
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== targetUrl) {
      if (options?.replace) {
        window.history.replaceState({}, '', targetUrl);
      } else {
        window.history.pushState({}, '', targetUrl);
      }
      setPath(cleanPath);
      window.scrollTo(0, 0);
    } else if (path !== cleanPath) {
      setPath(cleanPath);
    }
  }, [path]);

  const queryParam = useCallback((key: string): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }, []);

  return (
    <RouterContext.Provider value={{ path, navigate, queryParam }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useRouter must be used within a RouterProvider');
  return context;
};
