import { supabase } from '@/integrations/supabase/client';

export type ModerationActionType =
  | 'suppression'
  | 'suspension'
  | 'validation'
  | 'rejet'
  | 'reinitialisation'
  | 'modification';

export type ModerationTargetType =
  | 'pari'
  | 'sondage'
  | 'tournoi'
  | 'kiss_marry'
  | 'ticket'
  | 'utilisateur'
  | 'proposition'
  | 'gouvernement'
  | 'fantasy'
  | 'gazette'
  | 'autre';

export async function logModerationAction(params: {
  action_type: ModerationActionType;
  target_type: ModerationTargetType;
  target_id?: string | null;
  description: string;
  motif?: string | null;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from('moderation_log').insert({
      action_type: params.action_type,
      target_type: params.target_type,
      target_id: params.target_id ?? null,
      description: params.description,
      motif: params.motif ?? null,
      actor_id: user?.id ?? null,
    });
  } catch (e) {
    console.warn('moderation_log insert failed', e);
  }
}
