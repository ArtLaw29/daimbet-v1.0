# Plan — Bouton "📊 Exporter les statistiques" admin

## Emplacement
Dans `src/pages/AdminPage.tsx`, dans la carte "⚡ Accès rapide" (lignes 988-997) du dashboard admin (section overview). On ajoute le bouton aux côtés des autres `Button variant="outline" size="sm"` pour conserver le style.

## Comportement
1. État local `exporting` (boolean). Pendant l'export : libellé "Calcul en cours…", `disabled`, icône spinner.
2. Au clic, exécution en parallèle via `Promise.all` de 11 requêtes `supabase.from(...).select(...)`.
3. Calcul local des agrégats dans un objet JSON structuré (sections `global`, `paris`, `jeux`, `kiss_marry`, `engagement`, `non_participants`, `timeline`).
4. Téléchargement immédiat via `Blob` + `URL.createObjectURL` + `<a download="daimbet-stats-YYYY-MM-DD.json">`.
5. Toast succès / erreur via `sonner` (déjà utilisé dans le projet).
6. Reset de l'état `exporting` dans un `finally`.

## Détails techniques

### Requêtes
Toutes via `supabase.from(table).select(cols)`. Note : la table `bets` n'a pas de colonne `resolved_at` dans le schéma — on sélectionne uniquement les colonnes existantes (`id, status, created_at, close_date, updated_at`) et on ignore `resolved_at` (non utilisé dans les calculs demandés).

### Helpers de calcul
```ts
const median = (arr: number[]) => {
  const s = [...arr].sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length ? (s.length%2 ? s[m] : (s[m-1]+s[m])/2) : 0;
};
const groupByDay = (rows, field='created_at', valueFn?) => {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const d = (r[field] as string).slice(0,10);
    map[d] = (map[d] ?? 0) + (valueFn ? valueFn(r) : 1);
  }
  return map;
};
```

### Sections calculées
Conformes à la spec utilisateur :
- **global** : total_users, active_users (distinct user_id dans wagers non-rétractés ∪ game_participations), total_circulation_dc, avg/median/min/max balance, total_wagered_dc, total_retracted_dc, total_retraction_count, total_gains_bruts_dc (somme `delta_dc>0` & `reason` débute par "Gain").
- **paris** : compteurs par status, total_unique_bettors, pct_users_who_bet, avg_bettors_per_bet (Map bet_id → Set user_id puis moyenne).
- **jeux** : tableau pour `["sondage","tournoi","gouvernement","fantasy"]` ; pour chacun, sessions filtrées par `game_type`, participations join via `session_id ∈ ids`, calcul de tous les champs demandés.
- **kiss_marry** : `current_month = YYYY-MM` actuel, votes du mois, voters estimés `Math.round(votes/4)`, taux de participation.
- **engagement** : tickets ouverts (`ouvert`/`en_cours`), proposals `en_attente`, total gazette, total injections.
- **non_participants** : tableau récap pour Sondages, Tournois, Gouvernement, Fantasy Firm, Paris, Kiss/Marry ce mois (`users_not_participated`, `pct_not_participated`).
- **timeline** : `users_by_day`, `wagers_by_day` (somme `montant_dc`), `participations_by_day`, `bets_created_by_day`, `gazette_messages_by_day`.

### Téléchargement
```ts
const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `daimbet-stats-${new Date().toISOString().slice(0,10)}.json`;
document.body.appendChild(a); a.click(); a.remove();
URL.revokeObjectURL(url);
```

### Sécurité
Le bouton est rendu uniquement à l'intérieur de la page admin déjà protégée par `isAdmin` (route `/admin`). Les RLS existantes sur les tables (admin-only pour `wagers`, `solde_history`, `liquidity_injections`, `gazette_messages` admin-read full, etc.) suffisent. Aucune modification SQL nécessaire.

## Fichier modifié
- `src/pages/AdminPage.tsx` : ajout d'un état `exporting`, d'une fonction `handleExportStats`, et d'un `<Button>` dans la section "⚡ Accès rapide".
