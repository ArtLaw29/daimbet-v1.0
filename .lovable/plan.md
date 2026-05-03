## Objectif

Enrichir le formulaire de proposition de pari (`ProposeNewDialog` quand `kind === 'bet'`) pour permettre à l'utilisateur de fournir plus de contexte, et lui offrir une bascule vers un sondage si l'évènement n'a pas vocation à se réaliser.

## Nouveaux champs dans le dialogue "Proposer un pari"

1. **Sous-titre** (optionnel, max 120 caractères) — petite Input texte
2. **Description** (optionnel, max 500 caractères) — Textarea
3. **Date et heure de fin** (optionnel mais recommandé)
   - Datepicker shadcn (Popover + Calendar) pour la date
   - Input `type="time"` à côté pour l'heure
   - Combiné en un seul `Date` ISO envoyé dans `end_date_proposed`
   - Validation : doit être dans le futur
4. **Cotes suggérées** (optionnel) — uniquement quand au moins un choix est rempli
   - Pour chaque choix saisi, un petit Input numérique (`step=0.05`, min `1.0`) à droite du label
   - Indication "purement indicatif, l'admin peut ajuster"
5. **Bascule "C'est plutôt un sondage"** — un `Switch` en haut du dialogue
   - Si activé, le `kind` envoyé devient `sondage` au lieu de `bet`, et le copy/labels du formulaire s'adaptent (question au lieu d'intitulé, etc.)
   - Le sous-titre/description/date/cotes restent disponibles (la date devient la fin du sondage ; les cotes sont ignorées côté sondage)
   - Aide affichée : "Si l'évènement ne va pas vraiment se produire (juste un avis collectif), transforme-le en sondage."

## Mapping vers la table `daimocratie_proposals`

Aucune migration nécessaire — tout passe par les colonnes existantes :

- `title` → intitulé
- `end_date_proposed` → date+heure combinées en ISO
- `proposal_kind` → `'bet'` ou `'sondage'` selon le switch
- `options_json` → tableau enrichi `[{ label, suggested_cote }]` (le champ `suggested_cote` est ignoré côté sondage / activation, pas de breaking change car le edge function lit `o.label`)
- `payload` → on y range le reste :
  ```json
  {
    "subtitle": "...",
    "description": "...",
    "end_date": "2026-05-10T18:00:00.000Z",
    "suggested_odds": [{ "label": "OUI", "cote": 1.8 }, ...]
  }
  ```

## Affichage des nouvelles infos

- **`ProposalCard`** (à mettre à jour) : afficher sous-titre, description tronquée, date proposée formatée, et les cotes suggérées si présentes — pour que les votants aient le contexte avant de voter 👍/👎.
- **`activate-proposal` edge function** : déjà compatible — elle lit `payload.subtitle`, `payload.description`, `proposal.end_date_proposed`. Aucun changement requis. (Les cotes suggérées restent purement indicatives ; les vraies cotes restent calculées par `recalculate_odds`.)

## Détails techniques

```text
ProposeNewDialog (bet/sondage uniquement)
├── Switch "Transformer en sondage"  ← nouveau
├── Input  Intitulé / Question         (selon switch)
├── Input  Sous-titre (optionnel)      ← nouveau
├── Textarea Description (optionnel)   ← nouveau
├── Date Picker + time input           ← nouveau
├── Choix [ Input label | Input cote ] ← cote nouvelle (bet only)
│   + bouton "Ajouter un choix"
└── Soumettre
```

Validation côté client avec `zod` :
- `title` non vide, ≤ 200
- `subtitle` ≤ 120
- `description` ≤ 500
- `end_date` > now si fourni
- chaque cote ≥ 1.0 si fournie

## Fichiers modifiés

- `src/components/ProposeNewDialog.tsx` — ajout des champs, switch, validation, mapping payload
- `src/components/ProposalCard.tsx` — afficher sous-titre / description / date / cotes suggérées (lecture seule)

Aucune migration DB, aucun changement d'edge function nécessaire.
