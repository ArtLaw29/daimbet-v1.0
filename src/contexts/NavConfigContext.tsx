import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NavConfigContextType {
  visibleTabs: Record<string, boolean>;
  loading: boolean;
  toggleTab: (tabKey: string, visible: boolean) => Promise<void>;
}

const NavConfigContext = createContext<NavConfigContextType>({
  visibleTabs: {},
  loading: true,
  toggleTab: async () => {},
});

export const useNavConfig = () => useContext(NavConfigContext);

export function NavConfigProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setVisibleTabs({});
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchConfig = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('nav_config').select('tab_key, is_visible');

      if (!mounted) return;

      if (error) {
        console.error('Erreur chargement nav_config:', error);
        setLoading(false);
        return;
      }

      const config: Record<string, boolean> = {};
      (data || []).forEach((row) => {
        config[row.tab_key] = row.is_visible;
      });

      setVisibleTabs(config);
      setLoading(false);
    };

    fetchConfig();

    const channel = supabase
      .channel('nav_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nav_config' }, () => {
        fetchConfig();
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id]);

  const toggleTab = async (tabKey: string, visible: boolean) => {
    await supabase
      .from('nav_config')
      .update({ is_visible: visible, updated_at: new Date().toISOString() })
      .eq('tab_key', tabKey);
    setVisibleTabs((prev) => ({ ...prev, [tabKey]: visible }));
  };

  return (
    <NavConfigContext.Provider value={{ visibleTabs, loading, toggleTab }}>
      {children}
    </NavConfigContext.Provider>
  );
}
