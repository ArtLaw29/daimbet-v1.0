import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase.from('nav_config').select('tab_key, is_visible');
    if (data) {
      const config: Record<string, boolean> = {};
      data.forEach((row) => {
        config[row.tab_key] = row.is_visible;
      });
      setVisibleTabs(config);
    }
    setLoading(false);
  };

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
