## Goal
Add a "Classements de la promo" section at the bottom of the Gouvernement page (visible to everyone, even users who haven't formed a government), plus a 1-vs-1 compatibility comparison.

## Changes

### 1. Create `src/components/GouvernementStats.tsx`
New self-contained component (props-driven, no data fetching). Renders, in this order:
- "Dream Team de la promo" (top minister per ministry) with PDF download button.
- Top 10 most-cited DAIMs across all governments/remaniements.
- Top 3 per ministry (14 fixed ministries).
- Awards: Le/La Régalien·ne (≥3 citations, share of regalian ministries), Le/La Polyvalent·e (most distinct ministries), Le/La Spécialiste (≥90% on a single ministry).
- Most consensual (lowest Shannon entropy) and most divisive (highest entropy) ministries.
- Hall of Fame of custom ministries.
- "Dinosaures de la 3e République" (users with the most remaniements, ≥2).
- 1-vs-1 comparison: Select a DAIM from `PROMO_NAMES`, compute compatibility score (% of identical minister assignments across the 14 fixed ministries), per-ministry side-by-side table, plus auto-computed "jumeau gouvernemental" (highest score) and "opposé politique" (lowest score) vs the current user's latest gov.
- Empty state if `validGouvs.length === 0`.

The JSX blocks from the spec will be reordered to match the list above (Dream Team first, then Top 10, then Top 3 per ministry, then the rest unchanged). All computation logic stays identical.

Props:
```ts
{
  allGouvs: { user_id: string; data: GouvData }[];
  profiles: Record<string, { display_name: string; emoji: string | null; balance: number }>;
  currentUserId?: string | null;
  onDownloadDreamTeamPDF: (gouv: GouvData) => void;
}
```

### 2. Edit `src/components/GouvernementPage.tsx`
- Add import after the other `@/components/...` imports:
  ```tsx
  import GouvernementStats from '@/components/GouvernementStats';
  ```
- Insert just before `<ContactFooter />` at the end of the JSX:
  ```tsx
  <GouvernementStats
    allGouvs={allGouvs}
    profiles={profiles}
    currentUserId={user?.id}
    onDownloadDreamTeamPDF={(gouv) => {
      generateGouvPDF(gouv, 'La Promo', daimcoinLogo);
      toast.success('PDF Dream Team téléchargé 📄');
    }}
  />
  ```

Verified that `allGouvs`, `profiles`, `user`, `generateGouvPDF`, `daimcoinLogo`, `toast`, and `ContactFooter` are all already in scope inside `GouvernementPage.tsx`.

## Out of scope
- No Supabase migration.
- No new dependencies (uses existing `framer-motion`, `lucide-react`, shadcn `Button`/`Select`, and `PROMO_NAMES`).
- No changes to existing rendering above the stats section.