-- BLOC C: Étendre daimocratie_proposals pour porter tous types de propositions

ALTER TABLE public.daimocratie_proposals
  ADD COLUMN IF NOT EXISTS proposal_kind text NOT NULL DEFAULT 'bet',
  ADD COLUMN IF NOT EXISTS payload jsonb;

-- Index pour filtrer rapidement
CREATE INDEX IF NOT EXISTS idx_proposals_kind_status ON public.daimocratie_proposals(proposal_kind, status);

COMMENT ON COLUMN public.daimocratie_proposals.proposal_kind IS 'bet | sondage | tournoi | gouvernement | fantasy | kiss_marry';
COMMENT ON COLUMN public.daimocratie_proposals.payload IS 'Configuration complète de l''objet à créer si la proposition est validée';