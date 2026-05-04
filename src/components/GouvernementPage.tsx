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
import GouvernementStats from '@/components/GouvernementStats';
import jsPDF from 'jspdf';
import daimcoinLogo from '@/assets/daimcoin-logo.png';

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

const MINISTRY_EMOJIS: Record<string, string> = {
  interieur: '🚨', armees: '⚔️', travail: '🔧', ecologie: '🌿',
  justice: '⚖️', economie: '💰', agriculture: '🌾', education: '🎓',
  affaires_etrangeres: '🌍', sante: '🏥', culture: '🎭',
  sports: '🏆', numerique: '💻', comptes_publics: '📊',
};

function emojiToDataUrl(emoji: string, size = 28): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.font = `${size * 0.78}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function generateGouvPDF(gouv: GouvData, displayName: string, logoUrl: string) {
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
  const cardBgAlt: [number, number, number] = [26, 30, 42];
  const dividerCol: [number, number, number] = [60, 55, 35];

  const paintBackground = () => {
    doc.setFillColor(...bgColor);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    // Subtle watermark logo, centered
    try {
      const anyDoc = doc as any;
      if (anyDoc.GState && anyDoc.setGState) {
        anyDoc.setGState(new anyDoc.GState({ opacity: 0.05 }));
        const wmSize = 320;
        doc.addImage(logoUrl, 'PNG', (pageWidth - wmSize) / 2, (pageHeight - wmSize) / 2, wmSize, wmSize);
        anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
      }
    } catch {}
  };

  const paintHeader = () => {
    // Gold band
    doc.setFillColor(...goldColor);
    doc.rect(0, 0, pageWidth, 40, 'F');
    // Thin liserés (above & below)
    doc.setDrawColor(...goldDim);
    doc.setLineWidth(0.4);
    doc.line(margin, 4, pageWidth - margin, 4);
    doc.line(margin, 36, pageWidth - margin, 36);
    // DAIMBET wordmark in serif
    doc.setTextColor(...bgColor);
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.text('DAIMBET', margin, 27, { charSpace: 2 });
    // Logo on right
    try {
      doc.addImage(logoUrl, 'PNG', pageWidth - margin - 28, 6, 28, 28);
    } catch {}
    // Sub-header band (gov_name)
    doc.setFillColor(18, 21, 30);
    doc.rect(0, 40, pageWidth, 50, 'F');
    doc.setDrawColor(...goldDim);
    doc.setLineWidth(0.3);
    doc.line(margin, 90, pageWidth - margin, 90);
    const govLabel = gouv.gov_name || 'Gouvernement';
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...goldColor);
    doc.text(govLabel, margin, 70);
    if (gouv.created_at) {
      const d = new Date(gouv.created_at);
      const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dt = `Formé le ${dateStr} à ${timeStr}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...textMuted);
      const w = doc.getTextWidth(dt);
      doc.text(dt, pageWidth - margin - w, 84);
    }
  };

  const paintFooter = (pageIdx: number, total: number) => {
    doc.setDrawColor(...goldDim);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text('DAIMBET — République du DAIM', margin, pageHeight - 16);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    const disc = "Ce commentaire a été généré par une IA et ne reflète pas une opinion réelle.";
    const dw = doc.getTextWidth(disc);
    doc.text(disc, (pageWidth - dw) / 2, pageHeight - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const label = `page ${pageIdx} / ${total}`;
    const w = doc.getTextWidth(label);
    doc.text(label, pageWidth - margin - w, pageHeight - 16);
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - 50) {
      doc.addPage();
      paintBackground();
      paintHeader();
      cursorY = 110;
    }
  };

  paintBackground();
  paintHeader();
  let cursorY = 110;

  // Premier Ministre card
  ensureSpace(90);
  const pmCardHeight = 78;
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...goldDim);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, pmCardHeight, 6, 6, 'FD');
  // Left gold accent bar
  doc.setFillColor(...goldColor);
  doc.rect(margin, cursorY, 3, pmCardHeight, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...goldColor);
  doc.text('PREMIER MINISTRE', margin + 16, cursorY + 22, { charSpace: 2 });
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...textWhite);
  doc.text(displayName, margin + 16, cursorY + 50);
  doc.setFont('times', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(...goldColor);
  doc.text('Premier Ministre de la République du DAIM', margin + 16, cursorY + 68);
  cursorY += pmCardHeight + 22;

  // Ministries
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...goldColor);
  ensureSpace(28);
  doc.text('COMPOSITION DU GOUVERNEMENT', margin, cursorY, { charSpace: 1.5 });
  cursorY += 6;
  doc.setDrawColor(...goldDim);
  doc.setLineWidth(0.4);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 14;

  // Build the list of ministries to render
  const items: { label: string; person: string; regalian: boolean; emojiId?: string }[] = [];
  FIXED_MINISTRIES.forEach(m => {
    const person = gouv.ministers?.[m.id];
    if (person) items.push({ label: m.label, person, regalian: m.regalian, emojiId: m.id });
  });
  (gouv.custom_ministries || []).forEach(cm => {
    if (cm.name?.trim() && cm.person) items.push({ label: cm.name, person: cm.person, regalian: false });
  });

  const colGap = 12;
  const cardW = (pageWidth - margin * 2 - colGap) / 2;
  const cardH = 48;
  const rowGap = 10;

  const drawMinistryCard = (item: { label: string; person: string; regalian: boolean; emojiId?: string }, x: number, y: number, alt: boolean) => {
    doc.setFillColor(...(alt ? cardBgAlt : cardBg));
    doc.setDrawColor(...dividerCol);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, cardW, cardH, 5, 5, 'FD');
    // Régalien left bar
    if (item.regalian) {
      doc.setFillColor(...goldColor);
      doc.rect(x, y, 2.4, cardH, 'F');
    }
    // Emoji
    let textX = x + 10;
    if (item.emojiId && MINISTRY_EMOJIS[item.emojiId]) {
      const dataUrl = emojiToDataUrl(MINISTRY_EMOJIS[item.emojiId]);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'PNG', x + 8, y + 14, 22, 22);
          textX = x + 36;
        } catch {}
      }
    }
    // Validation badge top-right
    const bx = x + cardW - 12;
    const by = y + 10;
    doc.setFillColor(...goldColor);
    doc.circle(bx, by, 5, 'F');
    doc.setDrawColor(...bgColor);
    doc.setLineWidth(1);
    doc.line(bx - 2.2, by + 0.2, bx - 0.6, by + 1.8);
    doc.line(bx - 0.6, by + 1.8, bx + 2.4, by - 1.6);
    // Texts
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    const labelLines = doc.splitTextToSize(item.label.toUpperCase(), cardW - (textX - x) - 18) as string[];
    doc.text(labelLines[0], textX, y + 16, { charSpace: 0.6 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...textWhite);
    doc.text(item.person, textX, y + 34);
  };

  for (let i = 0; i < items.length; i += 2) {
    ensureSpace(cardH + rowGap);
    drawMinistryCard(items[i], margin, cursorY, false);
    if (items[i + 1]) drawMinistryCard(items[i + 1], margin + cardW + colGap, cursorY, true);
    cursorY += cardH + rowGap;
  }

  // Comment block — always on a new page
  if (gouv.comment) {
    doc.addPage();
    paintBackground();
    paintHeader();
    cursorY = 110;

    // Title
    doc.setDrawColor(...goldDim);
    doc.setLineWidth(0.4);
    doc.line(margin, cursorY - 8, pageWidth - margin, cursorY - 8);
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...goldColor);
    const title = 'COMMENTAIRE DU PRÉSIDENT JORDAIM BELFORT';
    const tw = doc.getTextWidth(title);
    doc.text(title, (pageWidth - tw) / 2, cursorY + 8, { charSpace: 1.5 });
    cursorY += 14;
    doc.line(margin, cursorY + 4, pageWidth - margin, cursorY + 4);
    cursorY += 22;

    // Big editorial card
    const innerPad = 22;
    const blockX = margin;
    const blockW = pageWidth - margin * 2;
    const textW = blockW - innerPad * 2;

    // Drop cap
    const raw = gouv.comment.trim();
    const firstLetter = raw.charAt(0);
    const rest = raw.slice(1);
    const dropSize = 38;
    const indentW = 28; // width reserved for drop cap on first lines
    const indentLines = 3;

    // Lines: first N lines wrap to (textW - indentW), then full textW
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    const indented = doc.splitTextToSize(rest, textW - indentW) as string[];
    const firstChunk = indented.slice(0, indentLines);
    const remainingText = indented.slice(indentLines).join(' ');
    const rest2 = remainingText ? (doc.splitTextToSize(remainingText, textW) as string[]) : [];
    const lineH = 14;
    const totalLines = firstChunk.length + rest2.length;
    const signatureH = 32;
    const blockH = innerPad * 2 + Math.max(dropSize, firstChunk.length * lineH) + rest2.length * lineH + signatureH;

    doc.setFillColor(...cardBg);
    doc.setDrawColor(...goldDim);
    doc.setLineWidth(0.8);
    doc.roundedRect(blockX, cursorY, blockW, blockH, 8, 8, 'FD');

    const tx = blockX + innerPad;
    let ty = cursorY + innerPad + 12;

    // Drop cap
    doc.setFont('times', 'bold');
    doc.setFontSize(dropSize);
    doc.setTextColor(...goldColor);
    doc.text(firstLetter, tx, ty + dropSize - 14);

    // First indented lines
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...textWhite);
    let lineY = ty;
    firstChunk.forEach((ln) => {
      doc.text(ln, tx + indentW, lineY);
      lineY += lineH;
    });
    // Remaining full-width lines
    if (rest2.length > 0) {
      // align baseline with first chunk continuation
      let y2 = ty + firstChunk.length * lineH;
      rest2.forEach((ln) => {
        doc.text(ln, tx, y2);
        y2 += lineH;
      });
    }

    // Signature, right-aligned at bottom of card
    const sigY = cursorY + blockH - innerPad - 4;
    doc.setFont('times', 'italic');
    doc.setFontSize(16);
    doc.setTextColor(...goldColor);
    const sig = 'Jordaim Belfort';
    const sw = doc.getTextWidth(sig);
    doc.text(sig, blockX + blockW - innerPad - sw, sigY - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    const role = 'Président de la République';
    const rw = doc.getTextWidth(role);
    doc.text(role, blockX + blockW - innerPad - rw, sigY);

    cursorY += blockH;
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    paintFooter(i, pageCount);
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
        // Sélectionner le record le plus récent de l'utilisateur qui contient un gouvernement réellement formé
        const mineAll = (gouvRes.data || [])
          .filter((p: any) => p.user_id === user.id)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const mineLatest = mineAll.find((p: any) => {
          const d = p.data as GouvData;
          return d?.gov_name && (Object.values(d.ministers || {}).some(Boolean) || (d.custom_ministries || []).some((cm: any) => cm.person));
        });
        if (mineLatest) {
          const data = mineLatest.data as GouvData;
          setExistingGouv(data);
          setMinisters(data.ministers || {});
          setCustomMinistries(data.custom_ministries?.length ? data.custom_ministries : [{ name: '', person: '' }, { name: '', person: '' }]);
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
    generateGouvPDF(existingGouv, existingGouv.creator_name || profile.display_name, daimcoinLogo);
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

      {/* Existing government comment (displayed below the form / "Remanier" button) */}
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
      <GouvernementStats
        allGouvs={allGouvs}
        profiles={profiles}
        currentUserId={user?.id}
        onDownloadDreamTeamPDF={(gouv) => {
          generateGouvPDF(gouv, 'La Promo', daimcoinLogo);
          toast.success('PDF Dream Team téléchargé 📄');
        }}
      />
      <ContactFooter />
    </div>
  );
}
