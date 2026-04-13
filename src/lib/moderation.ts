import { supabase } from '@/integrations/supabase/client';

/**
 * Check if text contains any banned words.
 * Returns the matched word or null.
 */
export async function checkBannedWords(text: string): Promise<string | null> {
  const { data } = await supabase.from('banned_words').select('word');
  if (!data) return null;
  const lower = text.toLowerCase();
  for (const { word } of data) {
    if (lower.includes(word.toLowerCase())) return word;
  }
  return null;
}

/**
 * Check if user has exceeded daily proposal limit (5/day across all games).
 */
export async function checkDailyRateLimit(userId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: proposalCount } = await supabase
    .from('daimocratie_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  return (proposalCount || 0) >= 5;
}

/**
 * Report a piece of content.
 */
export async function reportContent(
  contentType: string,
  contentId: string,
  reporterId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('content_reports').insert({
    content_type: contentType,
    content_id: contentId,
    reporter_id: reporterId,
    reason: reason || null,
  });
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Tu as déjà signalé ce contenu.' };
    return { success: false, error: 'Erreur lors du signalement.' };
  }
  return { success: true };
}
