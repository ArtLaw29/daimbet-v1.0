import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  nom: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255).regex(/@essec\.edu$/i, 'Email @essec.edu requis'),
  subject: z.enum(['mot_de_passe_oublie', 'email_non_recu', 'compte_bloque', 'inscription', 'autre']),
  message: z.string().trim().min(5).max(1000),
  website: z.string().max(0).optional(), // honeypot
});

const SUBJECT_LABELS: Record<string, string> = {
  mot_de_passe_oublie: 'Mot de passe oublié',
  email_non_recu: 'Email non reçu',
  compte_bloque: 'Compte bloqué',
  inscription: 'Problème inscription',
  autre: 'Autre',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Données invalides', detail: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { nom, email, subject, message, website } = parsed.data;
    if (website && website.length > 0) {
      // honeypot tripped — silently succeed
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: 1 / 5 min / IP, 5 / 24h / IP
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: recent5min } = await supabase
      .from('public_contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', fiveMinAgo);
    if ((recent5min ?? 0) >= 1) {
      return new Response(
        JSON.stringify({ error: 'Merci de patienter quelques minutes avant de renvoyer un message.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { count: recent24h } = await supabase
      .from('public_contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', dayAgo);
    if ((recent24h ?? 0) >= 5) {
      return new Response(
        JSON.stringify({ error: 'Limite quotidienne atteinte. Réessaie demain.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const subjectLabel = SUBJECT_LABELS[subject];

    const { error: insertError } = await supabase.from('public_contact_messages').insert({
      nom,
      email,
      subject: subjectLabel,
      message,
      ip_address: ip,
    });
    if (insertError) {
      console.error('insert error', insertError);
      return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin notification (red badge)
    await supabase.from('admin_notifications').insert({
      type: 'public_contact',
      title: `📬 Contact public : ${subjectLabel}`,
      detail: `${nom} <${email}> — ${message.slice(0, 200)}`,
    });

    // Resend email — immediate
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const ADMIN_EMAIL = 'jordan.gomes@essec.edu';

    if (RESEND_API_KEY && LOVABLE_API_KEY) {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#f5f5f5;padding:24px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#d4af37;margin:0;letter-spacing:2px;">DAIMBET 🦌💸</h1>
            <p style="color:#999;margin:4px 0;">Nouveau message via le portail public</p>
          </div>
          <div style="background:#1a1a1a;padding:20px;border-radius:8px;border-left:4px solid #d4af37;">
            <p style="margin:0 0 8px;"><strong style="color:#d4af37;">Sujet :</strong> ${subjectLabel}</p>
            <p style="margin:0 0 8px;"><strong style="color:#d4af37;">Nom :</strong> ${nom}</p>
            <p style="margin:0 0 16px;"><strong style="color:#d4af37;">Email de réponse :</strong> <a href="mailto:${email}" style="color:#d4af37;">${email}</a></p>
            <hr style="border:none;border-top:1px solid #333;margin:16px 0;"/>
            <p style="margin:0;white-space:pre-wrap;line-height:1.6;">${message.replace(/</g, '&lt;')}</p>
          </div>
          <p style="margin-top:24px;color:#666;font-size:12px;text-align:center;">
            Réponds directement à <a href="mailto:${email}" style="color:#d4af37;">${email}</a>.<br/>
            — Jordaim Belfort, capo di tutti capi 🦌
          </p>
        </div>
      `;

      try {
        const resp = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: 'DAIMBet <onboarding@resend.dev>',
            to: [ADMIN_EMAIL],
            reply_to: email,
            subject: `[DAIMBet] Contact public : ${subjectLabel}`,
            html,
          }),
        });
        if (!resp.ok) {
          console.error('Resend error', await resp.text());
        }
      } catch (e) {
        console.error('Resend exception', e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('public-contact error', e);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
