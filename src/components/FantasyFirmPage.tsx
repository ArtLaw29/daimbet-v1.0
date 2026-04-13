import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Briefcase, Loader2, Share2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TabIntro from '@/components/TabIntro';

const ROLES = [
  { id: 'associe', label: 'Associé', icon: '⭐' },
  { id: 'counsel', label: 'Counsel', icon: '🔷' },
  { id: 'collaborateur', label: 'Collaborateur', icon: '🔹' },
  { id: 'stagiaire', label: 'Stagiaire', icon: '📎' },
] as const;

type RoleId = typeof ROLES[number]['id'];

interface FirmMember {
  name: string;
  role: RoleId;
}

const SPECIALTIES: Record<string, string> = {
  'Sofia': 'Corporate/M&A/PE',
  'Issam': 'Droit des affaires',
  'Yara': 'Droit fiscal',
  'Chris-Aurélien': 'Fonds d\'investissement',
  'Yanis': 'Droit des nouvelles technologies',
  'Yoann': 'Droit fiscal',
  'Carla': 'Droit des affaires',
  'Hanna': 'Droit des affaires',
  'Cyrine': 'Corporate/M&A/PE',
  'Ghali': 'Contentieux',
  'Jihane': 'Corporate/M&A/PE',
  'Olivia': 'Droit des affaires',
  'Thomas': 'Droit fiscal',
  'Elma': 'Corporate/M&A/PE',
  'Eliot': 'Droit pénal des affaires & conformité',
  'James-Marie': 'Corporate/M&A/PE',
  'Alexandre': 'Restructuring',
  'Mathilde': 'Droit bancaire/financier et boursier',
  'Nassih': 'Corporate/M&A/PE',
  'Anaïs': 'Droit de la PI',
  'Pierre': 'Restructuring',
  'Noé': 'Corporate/M&A/PE',
  'Tiffany': 'Droit fiscal',
  'Maïlys': 'Droit pénal des affaires & conformité',
  'Nicole': 'Corporate/M&A/PE',
  'Grégoire': 'Corporate/M&A/PE',
  'Etienne': 'Droit social',
  'Paul': 'Droit des affaires',
  'Nicolas': 'Droit fiscal',
  'Louise': 'Droit de l\'énergie',
  'Sophie': 'Droit bancaire/financier et boursier',
  'Aya': 'Financement de projets',
  'Alice': 'Droit des affaires',
  'Angélique': 'Droit fiscal',
  'Imane': 'Contentieux',
  'Hania': 'Corporate/M&A/PE',
  'Dana': 'Corporate/M&A/PE',
  'Inès': 'Corporate/M&A/PE',
  'Laure': 'Droit public des affaires',
  'Augustin': 'Droit fiscal',
  'Willem': 'Droit fiscal',
  'Christophe': 'Droit de la concurrence',
  'Laura L.': 'Droit des affaires',
  'Ibtissam': 'Conformité',
  'Clara': 'Droit fiscal',
  'Philippe': 'Droit des affaires',
  'Garance': 'Droit de l\'immobilier',
  'Luca': 'Droit pénal des affaires & conformité',
  'Manon': 'Corporate/M&A/PE',
  'Yash': 'Contentieux',
  'Charles P.': 'Droit de la concurrence',
  'Célia': 'Droit de la PI',
  'Rosalie': 'Droit des affaires',
  'Alexis': 'Corporate/M&A/PE',
  'Samory': 'Fonds d\'investissement',
  'Tom': 'Droit bancaire/financier et boursier',
  'Beatrice': 'Droit des affaires',
  'Charles V.': 'Droit de l\'UE',
  'Léa': 'Droit de la concurrence',
  'Laura V.': 'Droit fiscal',
};

const FULL_NAMES: Record<string, string> = {
  'Sofia': 'Sofia Abaakil', 'Issam': 'Issam Abid', 'Yara': 'Yara Abou Atmeh',
  'Chris-Aurélien': 'Chris-Aurélien Agassi', 'Yanis': 'Yanis Amghar', 'Yoann': 'Yoann Barthélémy',
  'Carla': 'Carla Bechon', 'Hanna': 'Hanna Benahmed', 'Cyrine': 'Cyrine Ben Ahmed',
  'Ghali': 'Ghali Benjelloun', 'Jihane': 'Jihane Bensaid', 'Olivia': 'Olivia Bercaru',
  'Thomas': 'Thomas Biette', 'Elma': 'Elma Biscevic', 'Eliot': 'Eliot Bodard',
  'James-Marie': 'James-Marie Bruniaux', 'Alexandre': 'Alexandre Brunet', 'Mathilde': 'Mathilde Casanova',
  'Nassih': 'Nassih Chatillon', 'Anaïs': 'Anaïs Chrisment', 'Pierre': 'Pierre Corte',
  'Noé': 'Noé Courteaux', 'Tiffany': 'Tiffany De Oliveira', 'Maïlys': 'Maïlys Dubos',
  'Nicole': 'Nicole El Hayek', 'Grégoire': 'Grégoire Franck', 'Etienne': 'Etienne Fritsch',
  'Paul': 'Paul Genton', 'Nicolas': 'Nicolas Gerez', 'Louise': 'Louise Goeller',
  'Sophie': 'Sophie Grinstein', 'Aya': 'Aya Guaougaoui', 'Alice': 'Alice Herman',
  'Angélique': 'Angélique Hervigo', 'Imane': 'Imane Jaouhari', 'Hania': 'Hania Kenifed',
  'Dana': 'Dana Khazem', 'Inès': 'Inès Kies', 'Laure': 'Laure Laporte',
  'Augustin': 'Augustin Latouche', 'Willem': 'Willem Lesznewski-Dehaene', 'Christophe': 'Christophe Lienard',
  'Laura L.': 'Laura Louis', 'Ibtissam': 'Ibtissam Madani', 'Clara': 'Clara Maratona',
  'Philippe': 'Philippe Marchenoir', 'Garance': 'Garance Maugin', 'Luca': 'Luca Minet Munoz',
  'Manon': 'Manon Morel', 'Yash': 'Yash Nukcheddy', 'Charles P.': 'Charles Phulpin',
  'Célia': 'Célia Pinto', 'Rosalie': 'Rosalie Poisson', 'Alexis': 'Alexis Saada',
  'Samory': 'Samory Somet', 'Tom': 'Tom Spahr', 'Beatrice': 'Beatrice Torri',
  'Charles V.': 'Charles Vandenbrouck', 'Léa': 'Léa Verkindre', 'Laura V.': 'Laura Vladaj',
};

const PROMO_NAMES_LIST = Object.keys(SPECIALTIES).sort();
const ADLC_NAMES = ['Samory', 'Léa', 'Paul', 'Ghali', 'Charles P.', 'Christophe'];
const FANTASY_SESSION_ID = '00000000-0000-0000-0000-000000000002';

interface FirmData {
  members: FirmMember[];
  firm_name: string;
  firm_number: number;
}

export default function FantasyFirmPage() {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<FirmMember[]>([
    { name: '', role: 'associe' },
    { name: '', role: 'collaborateur' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [generatingNames, setGeneratingNames] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [firmName, setFirmName] = useState('');
  const [customName, setCustomName] = useState('');
  const [existingFirm, setExistingFirm] = useState<FirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'form' | 'naming' | 'card'>('form');

  useEffect(() => {
    const fetchExisting = async () => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('game_participations').select('*')
        .eq('session_id', FANTASY_SESSION_ID).eq('user_id', user.id).maybeSingle();
      if (data) {
        const d = data.data as unknown as FirmData;
        setExistingFirm(d);
        setMembers(d.members || []);
        setFirmName(d.firm_name || '');
        setStep('card');
      }
      setLoading(false);
    };
    fetchExisting();
  }, [user]);

  const usedNames = useMemo(() => new Set(members.map(m => m.name).filter(Boolean)), [members]);

  const availableFor = (current: string) =>
    PROMO_NAMES_LIST.filter(n => n === current || !usedNames.has(n));

  const addMember = () => setMembers([...members, { name: '', role: 'collaborateur' }]);
  const removeMember = (i: number) => {
    if (members.length <= 2) return;
    setMembers(members.filter((_, idx) => idx !== i));
  };
  const updateMember = (i: number, field: keyof FirmMember, value: string) => {
    const updated = [...members];
    updated[i] = { ...updated[i], [field]: value };
    setMembers(updated);
  };

  const filledMembers = members.filter(m => m.name);
  const associes = filledMembers.filter(m => m.role === 'associe');
  const isValid = filledMembers.length >= 2;

  const generateNames = async () => {
    if (associes.length === 0) {
      toast.error('Ajoute au moins un Associé pour générer un nom');
      return;
    }
    setGeneratingNames(true);
    try {
      const lastNames = associes.map(a => FULL_NAMES[a.name]?.split(' ').slice(1).join(' ') || a.name);
      const { data, error } = await supabase.functions.invoke('fantasy-firm-names', {
        body: { associes: lastNames },
      });
      if (error) throw error;
      setNameSuggestions(data.suggestions || []);
      setStep('naming');
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la génération des noms');
    } finally {
      setGeneratingNames(false);
    }
  };

  const selectName = (name: string) => {
    setFirmName(name);
    setCustomName('');
  };

  const confirmName = async () => {
    const finalName = customName.trim() || firmName;
    if (!finalName) { toast.error('Choisis ou saisis un nom de cabinet'); return; }
    setSubmitting(true);
    try {
      // Count existing firms by this user
      const { count } = await supabase.from('game_participations')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', FANTASY_SESSION_ID).eq('user_id', user!.id);

      const firmNumber = (count || 0) + (existingFirm ? 0 : 1);

      const firmData: FirmData = {
        members: filledMembers,
        firm_name: finalName,
        firm_number: firmNumber,
      };

      if (existingFirm) {
        await supabase.from('game_participations')
          .update({ data: firmData as any })
          .eq('session_id', FANTASY_SESSION_ID).eq('user_id', user!.id);
      } else {
        await supabase.from('game_participations').insert({
          session_id: FANTASY_SESSION_ID,
          user_id: user!.id,
          data: firmData as any,
        });
      }

      setExistingFirm(firmData);
      setFirmName(finalName);
      setStep('card');
      toast.success('Cabinet créé avec succès ! ⚖️');
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep('form');
    setNameSuggestions([]);
    setFirmName('');
    setCustomName('');
  };

  // Easter eggs
  const adlcMembers = filledMembers.filter(m => ADLC_NAMES.includes(m.name));
  const isADLC = adlcMembers.length >= 3;
  const isCreatorADLC = profile && ADLC_NAMES.some(n =>
    profile.display_name.toLowerCase().includes(n.toLowerCase())
  );

  const shareCard = async () => {
    try {
      await navigator.clipboard.writeText(
        `🏛️ ${firmName} — Mon cabinet d'avocats sur DaimBet !\n${filledMembers.map(m => `${ROLES.find(r => r.id === m.role)?.icon} ${m.name} — ${SPECIALTIES[m.name] || ''}`).join('\n')}`
      );
      toast.success('Copié dans le presse-papiers !');
    } catch {
      toast.error('Impossible de copier');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  if (!user) return <p className="text-center py-10 text-muted-foreground">Connecte-toi pour créer ton cabinet.</p>;

  // ========== CARD VIEW ==========
  if (step === 'card' && existingFirm) {
    const grouped = ROLES.map(r => ({
      ...r,
      members: existingFirm.members.filter(m => m.role === r.id),
    })).filter(g => g.members.length > 0);

    const initials = existingFirm.members.filter(m => m.role === 'associe')
      .map(m => (FULL_NAMES[m.name] || m.name).charAt(0).toUpperCase()).join('');

    return (
      <div className="space-y-6">
        <TabIntro emoji="⚖️" title="Daim Fantasy Firm" description="Mode Free Pick — Compose librement ton cabinet d'avocats à partir des élèves de la promo." />

        {/* Corporate Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl mx-auto border-2 border-primary/20 rounded-2xl overflow-hidden bg-gradient-to-b from-card to-background shadow-xl"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-8 text-center border-b border-primary/10">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
              <span className="text-xl font-bold text-primary tracking-wider">{initials || '⚖️'}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display tracking-wide text-foreground">
              {existingFirm.firm_name}
            </h2>
            <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">Avocats à la Cour</p>
          </div>

          {/* Members */}
          <div className="p-6 space-y-5">
            {grouped.map(group => (
              <div key={group.id}>
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2 font-semibold">
                  {group.icon} {group.label}{group.members.length > 1 ? 's' : ''}
                </h3>
                <div className="space-y-1.5">
                  {group.members.map((m, i) => (
                    <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-secondary/30">
                      <span className="font-medium text-sm">{FULL_NAMES[m.name] || m.name}</span>
                      <span className="text-xs text-muted-foreground">{SPECIALTIES[m.name] || ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Easter eggs */}
          {isADLC && (
            <div className="px-6 pb-2">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center text-sm">
                🧱 Bienvenue à l'équipe du cabinet Murailles partout !
                {isCreatorADLC && adlcMembers.length >= 3 && (
                  <p className="mt-1 text-xs text-muted-foreground italic">Et Brieg ? 🤔</p>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-6 pt-2 flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={shareCard}>
              <Share2 className="w-4 h-4 mr-1" /> Partager
            </Button>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Modifier le cabinet
            </Button>
          </div>
        </motion.div>

        <p className="text-center text-sm text-muted-foreground">
          Fier(e) de ton cabinet ? Partage-le avec la promo ! 🦌
        </p>
      </div>
    );
  }

  // ========== NAMING STEP ==========
  if (step === 'naming') {
    return (
      <div className="space-y-6">
        <TabIntro emoji="⚖️" title="Daim Fantasy Firm" description="Choisis le nom de ton cabinet." />

        <div className="max-w-md mx-auto space-y-4">
          <h3 className="font-semibold text-center">Suggestions de noms</h3>
          {nameSuggestions.map((name, i) => (
            <button
              key={i}
              onClick={() => selectName(name)}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                firmName === name
                  ? 'border-primary bg-primary/10 shadow-md'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <p className="font-semibold">{name}</p>
            </button>
          ))}

          <div className="relative">
            <p className="text-sm text-muted-foreground mb-1">Ou saisis un nom personnalisé :</p>
            <Input
              value={customName}
              onChange={e => { setCustomName(e.target.value); setFirmName(''); }}
              placeholder="Mon cabinet..."
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={resetForm} className="flex-1">Retour</Button>
            <Button onClick={confirmName} disabled={submitting || (!firmName && !customName.trim())} className="flex-1">
              {submitting ? <Loader2 className="animate-spin w-4 h-4" /> : 'Valider le nom'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ========== FORM STEP ==========
  return (
    <div className="space-y-6">
      <TabIntro
        emoji="⚖️"
        title="Daim Fantasy Firm"
        description="Mode Free Pick — Compose librement ton cabinet d'avocats à partir des élèves de la promo. Minimum 2 membres."
      />

      <div className="max-w-lg mx-auto space-y-3">
        {members.map((member, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 items-start"
          >
            {/* Role select */}
            <Select value={member.role} onValueChange={v => updateMember(i, 'role', v)}>
              <SelectTrigger className="w-[140px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.icon} {r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Name select */}
            <div className="flex-1">
              <Select value={member.name} onValueChange={v => updateMember(i, 'name', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un DAIM" />
                </SelectTrigger>
                <SelectContent>
                  {availableFor(member.name).map(n => (
                    <SelectItem key={n} value={n}>
                      {n} <span className="text-muted-foreground text-xs ml-1">— {SPECIALTIES[n]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {member.name && SPECIALTIES[member.name] && (
                <p className="text-xs text-muted-foreground mt-0.5 ml-1">{SPECIALTIES[member.name]}</p>
              )}
            </div>

            {/* Remove button */}
            <Button
              variant="ghost" size="icon"
              onClick={() => removeMember(i)}
              disabled={members.length <= 2}
              className="shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </motion.div>
        ))}

        <Button variant="outline" size="sm" onClick={addMember} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un membre
        </Button>

        <div className="pt-4">
          <Button
            onClick={generateNames}
            disabled={!isValid || generatingNames}
            className="w-full"
          >
            {generatingNames ? (
              <><Loader2 className="animate-spin w-4 h-4 mr-2" /> Génération des noms...</>
            ) : (
              <><Briefcase className="w-4 h-4 mr-2" /> Former le cabinet ({filledMembers.length} membres)</>
            )}
          </Button>
          {!isValid && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Minimum 2 membres requis
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
