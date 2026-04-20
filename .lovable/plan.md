
## Audit complet — DAIMBet (lecture seule)

J'ai parcouru les flux utilisateur et admin, en particulier les blocs récents F→M (Top 3 Kiss/Marry, sondages en %, Gouvernement, Fantasy Firm, détection d'acharnement, formulaires propose, suppression du 🚩, journal de modération). Voici les bugs confirmés et risques identifiés, classés par sévérité, avec correctifs proposés.

### 🔴 Bugs bloquants / sécurité

**1. Bloc L incomplet — la fonction `reportContent` et la table `content_reports` sont toujours actives.**
- `src/lib/moderation.ts` exporte toujours `reportContent()`.
- `AdminModeration.tsx` lit/écrit toujours dans `content_reports` (ligne 39, 123) et affiche une section "🚩 Contenus signalés" (ligne ~169) reposant sur les colonnes `report_count`/`is_hidden` mises à jour par le trigger `handle_content_report`.
- Risque : code mort exploitable ; un autre composant pourrait re-déclencher un signalement.
- **Fix** : supprimer `reportContent`, retirer la section "Contenus signalés" + les Promise sur `content_reports`/`proposalsRes`/`sessionsRes` dans `AdminModeration.tsx`. Optionnel : migration pour `DROP TRIGGER handle_content_report` et `DROP TABLE content_reports`.

**2. Bloc M sans intégration — `logModerationAction` n'est appelé nulle part.**
- Recherche `logModerationAction` → 0 occurrences en dehors du fichier qui le déclare. Le journal restera donc vide en production.
- **Fix** : brancher l'appel sur les actions admin clés dans `AdminPage.tsx` (`suspendBet`, `resolveBet`, `toggleSuspend`, suppression d'utilisateur, validation/rejet de propositions, reset par onglet, nuclear reset, suppression d'options/paris/sessions/tickets, et toggles `is_hidden`).

**3. `RulesScreen.tsx` introuvable dans la recherche `🚩|signal`.** OK confirmé : la mise à jour Bloc L est appliquée. Pas de bug, mais à vérifier visuellement.

### 🟠 Bugs fonctionnels

**4. Bloc F (Top 3 Kiss/Marry) — fuite d'info via la fonction RPC `get_km_results`.**
- `KissMarryPage.tsx` utilise `get_km_results` côté client puis tronque à `slice(0, 3)` (ligne 203). Mais l'utilisateur peut appeler la RPC directement (elle est `SECURITY DEFINER` et accessible à tout authentifié) et récupérer **le classement complet**. Bloc F demande explicitement que seuls les top 3 soient révélés à tous.
- **Fix** : créer une RPC `get_km_top3(p_month_year text)` qui retourne uniquement les 3 premiers par catégorie, et restreindre l'accès à `get_km_results` aux admins (ou la marquer `SECURITY INVOKER` + RLS `kiss_marry_votes` interdit le SELECT). Adapter `KissMarryPage.tsx` et `AdminHarassmentFlags.tsx` (qui doit conserver l'accès complet → l'appeler avec contexte admin/SD).

**5. Bloc G (Sondages en %) — l'ordre aléatoire est ré-tiré à chaque re-render.**
- `SondagePage.tsx` ligne 669 : `Math.random()` dans le composant `ResultsReveal` → l'ordre change à chaque animation/setState pendant le reveal, ce qui casse l'animation ligne par ligne (`if (i > revealStep) return null` joue sur des index incohérents) et clignote.
- **Fix** : mémoriser le shuffle avec `useMemo([results.map(r=>r.option).join('|')])` ou seed déterministe par `session.id`.

**6. Bloc G — la badge "winner" reste visible trop tôt.**
- L'accent doré (`isWinner`) est appliqué **pendant** la révélation progressive, donc dès que la ligne du gagnant apparaît (potentiellement avant la dernière). Bloc G demande un accent uniquement comme repère discret post-reveal.
- **Fix** : conditionner sur `revealDone` uniquement.

**7. Bloc H1 — `AdminGouvernements` ne montre pas le prénom du Premier Ministre.**
- Le titre dit "prénom du Premier Ministre (créateur)" — actuellement seul `display_name` est affiché. Vérifier que `display_name` correspond bien au prénom (selon mémoire `auth/registration` c'est le cas).
- Aussi : pas de filtre pour cacher les ministères vides ; OK, mais `gov_name` (libellé saisi par l'utilisateur) n'est jamais rendu, alors qu'il fait partie du data model.
- **Fix mineur** : afficher `gov_name` à côté du `gov_number`.

**8. Sondage proposé via `ProposeNewDialog` — n'apparaît pas dans la liste utilisateur.**
- Bloc K2 envoie la proposition dans `daimocratie_proposals` (table de la pipeline) avec `proposal_kind='sondage'`, `status='en_attente'`. Mais `SondagePage.tsx` lit depuis `game_sessions`. Tant que l'admin n'a pas activé la proposition (probablement via `activate-proposal`), l'utilisateur ne verra rien dans la section sondages → c'est attendu, mais il faut s'assurer que `PendingProposalsSection kind="sondage"` est bien rendu sur la page sondages (présent sur Kiss/Marry, à confirmer pour sondages/tournois).
- **Fix** : vérifier la présence et le bon `kind` du `PendingProposalsSection` sur `SondagePage` et `TournoiPage`. Vérifier que `activate-proposal` crée bien une `game_sessions` avec les `options_json`.

**9. Bloc J (acharnement) — IDs de session simulations fragiles + double-comptage Kiss/Marry.**
- `AdminHarassmentFlags.tsx` hardcode `00000000-0000-0000-0000-000000000001/2`. Si la table `game_sessions` ne contient pas ces lignes (cas après nuclear reset), aucune participation ne sera trouvée mais le code n'échoue pas — OK.
- Pour Kiss/Marry, `for (let i = 0; i < r.vote_count; i++) push(...)` crée une explosion de citations si une seule personne reçoit 50 votes → fonctionne mais le `sources` ne dédoublonnera jamais (Set OK). Vérifier que la moyenne reste cohérente (oui, totalCount / N).
- **Fix mineur** : ajouter un seuil minimum (`if vote_count < 2 ignore`) pour éviter de flagger sur 3 votes vs 1.

### 🟡 Risques UX / futurs

**10. `AdminPage.tsx` est devenu un fichier de 2771 lignes** — risque élevé de régression à chaque ajout. Aucun fix immédiat requis, mais à splitter quand l'audit sera fini.

**11. `localStorage` Kiss/Marry incohérent** — déjà mitigé par `km-vote check`, OK.

**12. La détection d'acharnement n'est pas temps réel.** Bloc J demande "recalculé à chaque nouvelle citation". Actuellement : recalcul uniquement au clic "Recalculer" ou à l'ouverture du panneau. Les Realtime channels sur `game_participations`/`kiss_marry_votes` (RLS interdit le SELECT à l'admin sur kiss_marry_votes, attention) seraient nécessaires.
- **Fix** : abonnement Realtime sur `game_participations` qui appelle `load()` (debounce 5s).

### Plan d'implémentation proposé (à exécuter en mode default après approbation)

1. **Bloc L cleanup** : supprimer `reportContent`, retirer la section "Contenus signalés" et toutes les requêtes `content_reports` de `AdminModeration.tsx`. Migration optionnelle pour DROP TABLE.
2. **Bloc M wiring** : ajouter `logModerationAction(...)` dans une dizaine d'endroits clés de `AdminPage.tsx` + actions de `AdminGouvernements/Sondages/Tournois`.
3. **Bloc F durcissement** : nouvelle RPC `get_km_top3` + refactor `KissMarryPage.tsx` + restriction `get_km_results` aux admins via SQL `REVOKE EXECUTE ... FROM authenticated; GRANT EXECUTE ... TO service_role;` (et garder un accès admin via une seconde RPC).
4. **Bloc G fix** : memoize shuffle + retarder le badge gagnant à `revealDone`.
5. **Bloc H1 polish** : afficher `gov_name` dans `AdminGouvernements`.
6. **Bloc J realtime** : ajout d'un canal Realtime + seuil minimum 3 citations.
7. **Bloc K vérification** : confirmer présence `PendingProposalsSection kind="sondage"|"tournoi"` sur les bonnes pages.

Les corrections 1, 2, 3 sont prioritaires (sécurité + journal vide). Les autres améliorent la conformité et la stabilité.
