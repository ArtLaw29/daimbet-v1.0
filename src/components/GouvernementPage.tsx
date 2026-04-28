import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Star, CheckCircle, Loader2, Crown, Users, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROMO_NAMES } from '@/lib/pari-mutuel';
import PendingProposalsSection from '@/components/PendingProposalsSection';
import ProposeNewDialog from '@/components/ProposeNewDialog';
import ContactFooter from '@/components/ContactFooter';
import jsPDF from 'jspdf';

const FIXED_MINISTRIES = [
  { id: 'interieur', label: 'Intérieur', regalian: true },
  { id: 'armees', label: 'Armées', regalian: true },
  { id: 'travail', label: 'Travail', regalian: false },
  { id: 'ecologie', label: 'Transition écologique', regalian: false },
  { id: 'justice', label: 'Justice', regalian: true },
  { id: 'economie', label: 'Économie & Finances', regalian: true },
  { id: 'agriculture', label: 'Agriculture', regalian: false },
  { id: 'education', label: 'Éducation nationale et Enseignement supérieur', regalian: false },
  { id: 'affaires_etrangeres', label: 'Affaires étrangères', regalian: true },
  { id: 'sante', label: 'Santé', regalian: false },
  { id: 'culture', label: 'Culture', regalian: false },
  { id: 'sports', label: 'Sports', regalian: false },
  { id: 'numerique', label: 'Numérique', regalian: false },
  { id: 'comptes_publics', label: 'Comptes Publics', regalian: false },
];

const REGALIAN_IDS = FIXED_MINISTRIES.filter(m => m.regalian).map(m => m.id);
const ADLC_NAMES = ['Samory', 'Léa', 'Paul', 'Ghali', 'Charles P.', 'Christophe'];

// Simple gender heuristic for PROMO_NAMES
const FEMALE_NAMES = [
  'Alice', 'Anaïs', 'Angélique', 'Beatrice', 'Carla', 'Celia', 'Clara', 'Cyrine',
  'Dana', 'Elma', 'Garance', 'Hania', 'Hanna', 'Ibtissam', 'Imane', 'Inès',
  'Jihane', 'Laura L.', 'Laura V.', 'Laure', 'Louise', 'Léa', 'Maïlys', 'Manon',
  'Mathilde', 'Nicole', 'Olivia', 'Philippine', 'Rosalie', 'Sofia', 'Sonya',
  'Tiffany', 'Yara',
];

interface GouvData {
  ministers: Record<string, string>;
  custom_ministries: { name: string; person: string }[];
  comment?: string;
  gov_number: number;
  gov_name: string;
  created_at?: string;
  creator_name?: string;
}

function generateGouvPDF(gouv: GouvData, displayName: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Theme colors
  const bgColor: [number, number, number] = [13, 15, 22]; // #0D0F16
  const goldColor: [number, number, number] = [228, 175, 49]; // hsl(42 92% 55%)
  const goldDim: [number, number, number] = [180, 138, 38];
  const textWhite: [number, number, number] = [245, 240, 230]; // warm white
  const textMuted: [number, number, number] = [160, 155, 145];
  const cardBg: [number, number, number] = [22, 26, 36];

  const paintBackground = () => {
    doc.setFillColor(...bgColor);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };

  const paintHeader = () => {
    doc.setFillColor(...goldColor);
    doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(...bgColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('DAIMBET', margin, 32);
    doc.setFontSize(12);
    const govLabel = gouv.gov_name || 'Gouvernement';
    const w = doc.getTextWidth(govLabel);
    doc.text(govLabel, pageWidth - margin - w, 32);
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - 60) {
      doc.addPage();
      paintBackground();
      paintHeader();
      cursorY = 80;
    }
  };

  paintBackground();
  paintHeader();
  let cursorY = 80;

  // Premier Ministre card
  ensureSpace(80);
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...goldDim);
  doc.setLineWidth(0.8);
  const pmCardHeight = gouv.created_at ? 78 : 56;
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, pmCardHeight, 6, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...goldColor);
  doc.text('PREMIER MINISTRE', margin + 14, cursorY + 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...textWhite);
  doc.text(displayName, margin + 14, cursorY + 42);
  if (gouv.created_at) {
    const d = new Date(gouv.created_at);
    const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textMuted);
    doc.text(`Formé le ${dateStr} à ${timeStr}`, margin + 14, cursorY + 62);
  }
  cursorY += pmCardHeight + 18;

  // Ministries
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...goldColor);
  ensureSpace(28);
  doc.text('COMPOSITION DU GOUVERNEMENT', margin, cursorY);
  cursorY += 16;

  const drawMinistry = (label: string, person: string, regalian: boolean) => {
    ensureSpace(34);
    doc.setFillColor(...cardBg);
    doc.setDrawColor(40, 44, 54);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 30, 4, 4, 'FD');
    if (regalian) {
      doc.setFillColor(...goldColor);
      doc.circle(margin + 10, cursorY + 15, 2.4, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text(label.toUpperCase(), margin + 18, cursorY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...textWhite);
    doc.text(person, margin + 18, cursorY + 24);
    cursorY += 34;
  };

  FIXED_MINISTRIES.forEach(m => {
    const person = gouv.ministers?.[m.id];
    if (person) drawMinistry(m.label, person, m.regalian);
  });

  (gouv.custom_ministries || []).forEach(cm => {
    if (cm.name?.trim() && cm.person) drawMinistry(cm.name, cm.person, false);
  });

  // Comment block
  if (gouv.comment) {
    cursorY += 10;
    const commentLines = doc.splitTextToSize(gouv.comment, pageWidth - margin * 2 - 28) as string[];
    const warningLines = doc.splitTextToSize(
      "Ce commentaire a été généré par une intelligence artificielle et ne reflète pas une opinion réelle.",
      pageWidth - margin * 2 - 28
    ) as string[];
    const blockHeight = 30 + commentLines.length * 14 + 10 + warningLines.length * 10 + 16;
    ensureSpace(blockHeight);
    doc.setFillColor(...cardBg);
    doc.setDrawColor(...goldDim);
    doc.setLineWidth(0.8);
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, blockHeight, 6, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...goldColor);
    doc.text('COMMENTAIRE DU PRESIDENT JORDAIM BELFORT', margin + 14, cursorY + 20);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...textWhite);
    doc.text(commentLines, margin + 14, cursorY + 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text(warningLines, margin + 14, cursorY + 38 + commentLines.length * 14 + 14);
    cursorY += blockHeight + 10;
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    const label = `page ${i} / ${pageCount}`;
    const w = doc.getTextWidth(label);
    doc.text(label, pageWidth - margin - w, pageHeight - 20);
  }

  const safeName = (gouv.gov_name || 'gouvernement').replace(/[^\w\s\-]/g, '').trim() || 'gouvernement';
  doc.save(`${safeName}.pdf`);
}

export default function GouvernementPage() {
  const { user, profile } = useAuth();
  const [ministers, setMinisters] = useState<Record<string, string>>({});
  const [customMinistries, setCustomMinistries] = useState<{ name: string; person: string }[]>([
    { name: '', person: '' },
    { name: '', person: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingComment, setLoadingComment] = useState(false);
  const [existingGouv, setExistingGouv] = useState<GouvData | null>(null);
  const [allGouvs, setAllGouvs] = useState<{ user_id: string; data: GouvData }[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string; emoji: string | null; balance: number }>>({});
  const [loading, setLoading] = useState(true);

  // Fetch existing data
  useEffect(() => {
    const fetch = async () => {
      const [gouvRes, profilesRes] = await Promise.all([
        (supabase as any).rpc('get_gouvernements_public', { p_session_id: '00000000-0000-0000-0000-000000000001' }),
        (supabase as any).from('profiles_public').select('user_id, display_name, emoji, balance'),
      ]);

      const allData = (gouvRes.data || []).map(p => ({
        user_id: p.user_id,
        data: p.data as unknown as GouvData,
      }));
      setAllGouvs(allData);

      const prMap: Record<string, { display_name: string; emoji: string | null; balance: number }> = {};
      (profilesRes.data || []).forEach(p => { prMap[p.user_id] = p; });
      setProfiles(prMap);

      if (user) {
        const mine = allData.find(g => g.user_id === user.id);
        if (mine) {
          setExistingGouv(mine.data);
          setMinisters(mine.data.ministers || {});
          setCustomMinistries(mine.data.custom_ministries?.length ? mine.data.custom_ministries : [{ name: '', person: '' }, { name: '', person: '' }]);
        }
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  // Compute used names
  const usedNames = useMemo(() => {
    const names = new Set<string>();
    Object.values(ministers).forEach(n => { if (n) names.add(n); });
    customMinistries.forEach(cm => { if (cm.person) names.add(cm.person); });
    return names;
  }, [ministers, customMinistries]);

  const availableNamesFor = (currentValue: string) => {
    return PROMO_NAMES.filter(n => n === currentValue || !usedNames.has(n));
  };

  // Validation
  const filledCount = useMemo(() => {
    let count = Object.values(ministers).filter(Boolean).length;
    customMinistries.forEach(cm => { if (cm.name.trim() && cm.person) count++; });
    return count;
  }, [ministers, customMinistries]);

  const regalianFilledCount = useMemo(() => {
    return REGALIAN_IDS.filter(id => !!ministers[id]).length;
  }, [ministers]);

  const isValid = filledCount >= 10 && regalianFilledCount >= 4;

  // (Popularity stats removed — never displayed publicly nor sent to AI)

  // Get user rank
  const userRank = useMemo(() => {
    const sorted = Object.values(profiles).sort((a, b) => b.balance - a.balance);
    const idx = sorted.findIndex(p => p === profiles[user?.id || '']);
    return idx >= 0 ? idx + 1 : sorted.length;
  }, [profiles, user]);

  const handleRemanier = () => {
    setMinisters({});
    setCustomMinistries([{ name: '', person: '' }, { name: '', person: '' }]);
    setExistingGouv(null);
  };

  const handleDownloadPDF = () => {
    if (!existingGouv || !profile) return;
    generateGouvPDF(existingGouv, existingGouv.creator_name || profile.display_name);
    toast.success('PDF téléchargé 📄');
  };

  const handleSubmit = async () => {
    if (!user || !profile || !isValid) return;
    setSubmitting(true);

    // Count previous governments by this user
    const userGouvCount = allGouvs.filter(g => g.user_id === user.id).length;
    const govNumber = userGouvCount + 1;
    const govName = `Gouvernement ${profile.display_name} ${govNumber}`;

    // Check ADLC easter egg
    const allSelectedNames = [...Object.values(ministers), ...customMinistries.map(cm => cm.person)].filter(Boolean);
    const adlcCount = allSelectedNames.filter(n => ADLC_NAMES.includes(n)).length;
    const isADLC = adlcCount >= 4;

    // Gender stats
    const maleCount = allSelectedNames.filter(n => !FEMALE_NAMES.includes(n)).length;
    const femaleCount = allSelectedNames.filter(n => FEMALE_NAMES.includes(n)).length;

    // (popularity text removed)

    const gouvData: GouvData = {
      ministers,
      custom_ministries: customMinistries.filter(cm => cm.name.trim() && cm.person),
      gov_number: govNumber,
      gov_name: govName,
      created_at: new Date().toISOString(),
      creator_name: profile.display_name,
    };

    // Always insert a new record
    await supabase.from('game_participations').insert({
      session_id: '00000000-0000-0000-0000-000000000001',
      user_id: user.id,
      data: gouvData as any,
    });

    // Generate AI comment
    setLoadingComment(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('gouvernement-comment', {
        body: {
          ministers,
          customMinistries: customMinistries.filter(cm => cm.name.trim() && cm.person),
          premierMinisterName: profile.display_name,
          premierMinisterRank: userRank,
          premierMinisterBalance: profile.balance,
          totalPlayers: Object.keys(profiles).length,
          regaliansFilled: regalianFilledCount,
          regaliansTotal: 5,
          totalFilled: filledCount,
          maleCount,
          femaleCount,
          isADLC,
        },
      });

      if (fnError) throw fnError;
      const comment = fnData?.comment || 'Le Président est temporairement indisponible.';
      gouvData.comment = comment;

      // Update the newly inserted record with comment
      // Get the latest record for this user
      const { data: latestRows } = await supabase.from('game_participations')
        .select('id')
        .eq('session_id', '00000000-0000-0000-0000-000000000001')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestRows && latestRows.length > 0) {
        await supabase.from('game_participations')
          .update({ data: gouvData as any })
          .eq('id', latestRows[0].id);
      }

      setExistingGouv(gouvData);
    } catch (e) {
      console.error('AI comment error:', e);
      gouvData.comment = '🏛️ Le Président Jordaim Belfort est en réunion. Son commentaire arrivera plus tard.';
      setExistingGouv(gouvData);
    }

    // Refresh allGouvs (via SECURITY DEFINER RPC)
    const { data: refreshed } = await (supabase as any).rpc('get_gouvernements_public', { p_session_id: '00000000-0000-0000-0000-000000000001' });
    setAllGouvs((refreshed || []).map((p: any) => ({ user_id: p.user_id, data: p.data as unknown as GouvData })));

    setLoadingComment(false);
    setSubmitting(false);
    toast.success(`${govName} formé ! 🏛️`);
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-2">
        <p className="text-4xl">🏛️</p>
        <h2 className="text-xl font-display mt-1">Gouvernement</h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mt-2">
          Bravo, tu as été choisi(e) pour être le Premier Ministre du Président Jordaim Belfort.
          Compose ton gouvernement en nommant des membres de la promo DAIM aux postes suivants.
          Tu dois nommer au minimum 10 ministres, dont au moins 4 ministères régaliens, sur un total de 16 postes possibles.
          Un même DAIM ne peut occuper qu'un seul poste.
        </p>
      </div>

      <div className="flex justify-center">
        <ProposeNewDialog kind="gouvernement" buttonLabel="Proposer une variante" />
      </div>
      <PendingProposalsSection kind="gouvernement" />

      {/* Existing government comment */}
      {existingGouv?.comment && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                <h3 className="font-display text-primary">{existingGouv.gov_name}</h3>
              </div>
              {existingGouv.created_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Formé par {existingGouv.creator_name || profile?.display_name} le{' '}
                  {new Date(existingGouv.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{' '}
                  à {new Date(existingGouv.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={handleDownloadPDF} className="flex-shrink-0">
              <Download className="w-4 h-4 mr-1.5" />
              Télécharger le PDF
            </Button>
          </div>
          <p className="text-sm whitespace-pre-line">{existingGouv.comment}</p>
          <p className="text-xs text-foreground/80 italic mt-3 border-t border-primary/20 pt-3 font-medium">
            🤖 Ce commentaire a été généré par une intelligence artificielle et ne reflète pas une opinion réelle.
          </p>
        </motion.div>
      )}

      {loadingComment && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Le Président Jordaim Belfort rédige son commentaire...</p>
        </div>
      )}

      {/* Form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">
            {existingGouv ? '✏️ Modifier ton gouvernement' : '🏛️ Former ton gouvernement'}
          </h3>
          <div className="text-xs text-muted-foreground">
            {filledCount}/16 postes • {regalianFilledCount}/4 régaliens min.
          </div>
        </div>

        {/* Validation status */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`px-2 py-1 rounded-full ${filledCount >= 10 ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
            {filledCount >= 10 ? '✓' : '✗'} Min. 10 postes ({filledCount}/10)
          </span>
          <span className={`px-2 py-1 rounded-full ${regalianFilledCount >= 4 ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
            {regalianFilledCount >= 4 ? '✓' : '✗'} Min. 4 régaliens ({regalianFilledCount}/4)
          </span>
        </div>

        {/* Fixed ministries */}
        <div className="space-y-3">
          {FIXED_MINISTRIES.map(ministry => (
            <div key={ministry.id} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 min-w-[200px] md:min-w-[280px]">
                {ministry.regalian && <Star className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                <span className="text-sm font-medium truncate">{ministry.label}</span>
              </div>
              <Select value={ministers[ministry.id] || '__none__'} onValueChange={v => setMinisters(prev => ({ ...prev, [ministry.id]: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choisir un DAIM..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Aucun —</SelectItem>
                  {availableNamesFor(ministers[ministry.id] || '').map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {/* Custom ministries */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-semibold">📝 Ministères personnalisés (2 max)</p>
          {customMinistries.map((cm, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder={`Ministère perso ${i + 1}`}
                value={cm.name}
                onChange={e => {
                  const updated = [...customMinistries];
                  updated[i] = { ...updated[i], name: e.target.value };
                  setCustomMinistries(updated);
                }}
                className="flex-1"
              />
              <Select value={cm.person || '__none__'} onValueChange={v => {
                const updated = [...customMinistries];
                updated[i] = { ...updated[i], person: v === '__none__' ? '' : v };
                setCustomMinistries(updated);
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choisir un DAIM..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Aucun —</SelectItem>
                  {availableNamesFor(cm.person || '').map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {existingGouv ? (
          <Button className="w-full" variant="outline" onClick={handleRemanier}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Remanier le gouvernement 🏛️
          </Button>
        ) : (
          <Button className="gold-gradient w-full" disabled={!isValid || submitting} onClick={handleSubmit}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crown className="w-4 h-4 mr-2" />}
            Former le gouvernement 🏛️
          </Button>
        )}
      </div>

      {/* Other governments */}
      {allGouvs.filter(g => g.user_id !== user?.id && g.data.gov_name).length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg flex items-center gap-2">
            <Users className="w-4 h-4" /> Autres gouvernements
          </h3>
          {allGouvs.filter(g => g.user_id !== user?.id && g.data.gov_name).map((g, i) => {
            const pr = profiles[g.user_id];
            const filledPosts = Object.values(g.data.ministers || {}).filter(Boolean).length +
              (g.data.custom_ministries || []).filter((cm: any) => cm.person).length;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span>{pr?.emoji || '🦌'}</span>
                  <h4 className="font-semibold text-sm">{g.data.gov_name}</h4>
                  <span className="text-[10px] text-muted-foreground">({filledPosts} postes)</span>
                </div>
                {g.data.comment && (
                  <p className="text-xs text-muted-foreground italic line-clamp-3">{g.data.comment}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      <ContactFooter />
    </div>
  );
}
