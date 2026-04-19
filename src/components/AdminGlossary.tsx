import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'DaimCoins (DC)', definition: 'Monnaie virtuelle de la plateforme DaimBet. Capital de départ : 1 000 DC par joueur.' },
  { term: 'Daim', definition: 'Surnom de la promo. Utilisé comme identité culturelle de la plateforme.' },
  { term: 'Jordaim Belfort', definition: 'Persona de l\'administrateur de la plateforme. Seul compte avec accès au portail admin.' },
  { term: 'Pari (bet)', definition: 'Événement créé par l\'admin sur lequel les joueurs peuvent miser.' },
  { term: 'Mise (wager)', definition: 'Montant en DC placé par un joueur sur une option d\'un pari.' },
  { term: 'Option', definition: 'Choix possible dans un pari (ex : OUI/NON pour un binaire, candidats pour un Tiercé).' },
  { term: 'Pari mutuel', definition: 'Système de cotes dynamiques : Cote = Total misé sur le pari / Total misé sur l\'option. Plancher : 1.0. Défaut (sans mise) : 1.10.' },
  { term: 'Rake', definition: 'Commission prélevée sur les paris (ne s\'applique pas aux sondages ni aux jeux). 5 % sur les gains nets (gain brut − mise).' },
  { term: 'Cote estimée', definition: 'Cote affichée tant que le pari est ouvert. Évolue avec chaque nouvelle mise.' },
  { term: 'Cote figée', definition: 'Cote fixée au moment de la clôture des mises. Utilisée pour le calcul final des gains.' },
  { term: 'Clôture', definition: 'Fermeture des mises (plus aucune nouvelle mise possible). Se produit automatiquement selon la règle close_date.' },
  { term: 'Fin du pari', definition: 'Date à laquelle l\'événement sous-jacent se termine réellement (ex : fin du cours, fin du match).' },
  { term: 'Résolution', definition: 'Action manuelle de l\'admin qui désigne le(s) gagnant(s) et déclenche le versement des gains.' },
  { term: 'Chronologie d\'un pari', definition: 'Création → Ouvert (mises) → Clôture (mises fermées) → Fin du pari → Résolution (gains distribués).' },
  { term: 'Binaire', definition: 'Type de pari à 2 options : OUI / NON.' },
  { term: 'Over/Under', definition: 'Type de pari à 2 options basé sur un seuil numérique : au-dessus ou en-dessous.' },
  { term: 'Tranches multiples', definition: 'Type de pari à 2-5 options représentant des intervalles.' },
  { term: 'Tiercé du Daim', definition: 'Type de pari à 6-20 candidats (prénoms de la promo). Ouvert aux suggestions. 1 mise par joueur.' },
  { term: 'Catégorie Urgent', definition: 'Pari à court terme. Mise max : 30 % du solde.' },
  { term: 'Catégorie Long terme', definition: 'Pari sur plusieurs jours/semaines. Mise max : 15 % du solde.' },
  { term: 'Catégorie Culture Daim', definition: 'Pari ludique/culturel. Mise max : 30 % du solde.' },
  { term: 'Droit de Remords', definition: 'Possibilité de rétracter sa mise pendant la fenêtre horaire configurée (par défaut 00h-09h CET). Sans rake.' },
  { term: 'Rétractation', definition: 'Annulation d\'une mise active. Le montant est remboursé intégralement (aucun rake). Les cotes sont recalculées.' },
  { term: 'Solde', definition: 'Nombre de DaimCoins (DC) disponibles pour un joueur. Visible sur le profil et dans la barre de navigation.' },
  { term: 'Classement', definition: 'Classement des joueurs par solde décroissant. Masquable par l\'admin.' },
  { term: 'Pipeline', definition: 'Système de propositions et votes des utilisateurs pour soumettre de nouvelles idées de paris, sondages, tournois. Anciennement « Daimocratie ».' },
  { term: 'Daimocratie — Sondages', definition: 'Jeu de sondages avec mise de DC et pronostic secret. Les joueurs votent et parient sur le résultat.' },
  { term: 'You Decide — Tournois', definition: 'Jeu de duels façon coupe du monde avec bracket et mises. Les choix s\'affrontent en duels successifs.' },
  { term: 'Gouvernement', definition: 'Jeu de simulation de composition de gouvernement. L\'utilisateur nomme des membres de la promo aux postes ministériels.' },
  { term: 'Fantasy Firm', definition: 'Jeu de création de cabinet d\'avocats fictif. L\'utilisateur compose son cabinet et génère un nom corporate.' },
  { term: 'Pronostic secret', definition: 'Prédiction personnelle stockée en base, invisible des autres joueurs, récompensée si correcte.' },
  { term: 'Session', definition: 'Instance d\'un jeu. Plusieurs sessions peuvent coexister simultanément.' },
  { term: 'Kiss/Marry', definition: 'Sondage anonyme mensuel en 4 catégories. Votes hachés (jamais de user_id direct).' },
  { term: 'Gazette', definition: 'Fil d\'actualités de la plateforme. Messages automatiques et manuels. Auteur et horodatage invisibles côté utilisateur.' },
  { term: 'Ticket', definition: 'Conversation de support entre un utilisateur et l\'administrateur (Jordaim Belfort).' },
  { term: 'Kill Switch', definition: 'Bouton de suspension d\'urgence d\'un jeu par l\'admin. Désactive temporairement l\'accès.' },
  { term: 'Bouton nucléaire', definition: 'Réinitialisation complète d\'un onglet/jeu. Irréversible. Protégée par 3 étapes de confirmation.' },
  { term: 'Bye (tournois)', definition: 'Quand un nombre impair de choix existe dans un tournoi, un choix passe automatiquement au tour suivant sans duel.' },
  { term: 'Tirage au sort', definition: 'Mode de résolution alternatif : le gagnant est choisi aléatoirement parmi les parieurs (pondéré par mise).' },
  { term: 'Injection de liquidité', definition: 'Ajout de 250 DC au solde de tous les joueurs. Déclenché par l\'admin.' },
  { term: 'Suspension', definition: 'Blocage temporaire d\'un compte utilisateur par l\'admin.' },
  { term: 'Mode maintenance', definition: 'Activation qui rend la plateforme inaccessible à tous sauf l\'admin.' },
  { term: 'Statut : Ouvert', definition: 'Le pari accepte les mises.' },
  { term: 'Statut : Clôturé (en attente)', definition: 'Les mises sont fermées. En attente de résolution.' },
  { term: 'Statut : Résolu', definition: 'Le pari est terminé. Les gains ont été distribués.' },
  { term: 'Statut : Suspendu', definition: 'Le pari est temporairement gelé par l\'admin.' },
  { term: 'Statut : Supprimé', definition: 'Le pari a été supprimé. Toutes les mises ont été remboursées.' },
  { term: 'Suggestion Tiercé', definition: 'Proposition d\'un candidat par un joueur pour un Tiercé du Daim. Nécessite approbation admin.' },
  { term: 'Notification admin', definition: 'Alerte dans le portail admin (nouvelle mise, suggestion, ticket, etc.).' },
];

export default function AdminGlossary() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return GLOSSARY;
    const q = search.toLowerCase();
    return GLOSSARY.filter(
      g => g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-display tracking-[0.05em]">📖 Glossaire Jordaim Belfort</h2>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un terme…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px] font-display">Terme</TableHead>
              <TableHead className="font-display">Définition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(g => (
              <TableRow key={g.term}>
                <TableCell className="font-semibold text-primary whitespace-nowrap">{g.term}</TableCell>
                <TableCell className="text-sm">{g.definition}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                  Aucun terme trouvé pour « {search} »
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">{GLOSSARY.length} termes · Référence PRD §22</p>
    </div>
  );
}
