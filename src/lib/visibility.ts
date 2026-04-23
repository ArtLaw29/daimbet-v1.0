import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the set of display_names (lowercased) of users who have opted out
 * of being mentionable in a given game.
 */
export async function fetchHiddenNames(
  field: 'visible_in_sondages' | 'visible_in_kiss_marry'
): Promise<Set<string>> {
  const { data } = await (supabase
    .from('profiles_public') as any)
    .select('display_name,' + field) as any)
    .eq(field, false);
  const set = new Set<string>();
  (data || []).forEach((p: any) => {
    if (p.display_name) set.add(String(p.display_name).toLowerCase());
  });
  return set;
}

export function filterNames(names: string[], hidden: Set<string>): string[] {
  return names.filter(n => !hidden.has(n.toLowerCase()));
}
