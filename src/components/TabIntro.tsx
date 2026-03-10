import { ReactNode } from 'react';

interface TabIntroProps {
  children: ReactNode;
}

export default function TabIntro({ children }: TabIntroProps) {
  return (
    <div className="bg-secondary/30 border border-border rounded-xl p-4 mb-6 text-sm text-muted-foreground leading-relaxed">
      {children}
    </div>
  );
}

export const INTRO_PARIS = (
  <TabIntro>
    <p className="font-medium text-foreground mb-2">
      Bienvenue sur le premier marché de prédiction de la promo.
    </p>
    <p>
      Oublie ton CV : ici, ta connaissance de la promo vaut de l'or, et ton instinct fait le reste.
    </p>
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
      <p className="text-sm text-foreground">
        🛡️ Tous les paris sont modérés, leur résolution est assurée par l'admin, et une règle est sacrée sur DaimBet : <strong>on rigole ensemble, jamais aux dépens de quelqu'un.</strong> 🤝
      </p>
    </div>
    <ul className="mt-3 space-y-1 text-xs list-disc list-inside">
      <li>📊 <strong>Pari mutuel</strong> — les cotes évoluent en temps réel selon les mises de la promo</li>
      <li>💰 <strong>Mise max</strong> — 30% de ton solde (15% pour les paris long terme)</li>
      <li>🔒 <strong>Cotes figées à la clôture des mises</strong> — ton gain final est calculé à ce moment-là, pas quand tu as misé</li>
      <li>↩️ <strong>Option de rétractation</strong> — tu peux annuler ta mise dès le lendemain, pendant la plage horaire autorisée</li>
    </ul>
    <div className="mt-4 pt-3 border-t border-border/50">
      <p className="font-medium text-foreground mb-2">Comment lire une cote ?</p>
      <p>
        Une cote haute (ex : 4.5) signifie que peu de parieurs pensent que cette option se réalisera — si tu as raison contre la promo, tes gains sont importants.
      </p>
      <p className="mt-1">
        Une cote basse (ex : 1.2) signifie que la majorité parie déjà sur cette option — le marché la considère quasi certaine, mais si elle se réalise, tu ne gagnes que peu.
      </p>
      <p className="mt-2 text-xs italic text-muted-foreground">
        Miser sur l'outsider, c'est risqué. Miser sur le favori, c'est prudent. À toi de lire la promo mieux que les autres.
      </p>
    </div>
  </TabIntro>
);

export const INTRO_CLASSEMENT = (
  <TabIntro>
    <p className="font-medium text-foreground mb-2">
      Suis ton classement et surveille tes concurrents en temps réel.
    </p>
    <p>
      Classement mensuel + all-time. En cas d'égalité de solde, le rang est partagé.
    </p>
  </TabIntro>
);

export const INTRO_KISS_MARRY = (
  <TabIntro>
    <p className="font-medium text-foreground mb-2">
      Le jeu dont tout le monde parle, mais dont personne ne connaît les votes.
    </p>
    <p>
      Ici, l'anonymat des votes est le secret le mieux gardé.
    </p>
    <ul className="mt-3 space-y-1 text-xs list-disc list-inside">
      <li>💋 <strong>Kiss</strong> et 💍 <strong>Marry</strong> — obligatoires</li>
      <li>🌙 <strong>Coup d'un soir</strong> et 🔥 <strong>Plan Q</strong> — optionnels</li>
      <li>⚠️ Une seule chance par mois. Non modifiable après confirmation.</li>
    </ul>
  </TabIntro>
);

export const INTRO_GAZETTE = (
  <TabIntro>
    <p className="font-medium text-foreground mb-2">
      📰 La Gazette du Daim — le fil d'actualité de la promo.
    </p>
    <p>
      Partage tes réactions, commente les résultats et suis les dernières nouvelles de DaimBet.
      Les messages sont modérés par Jordaim Belfort.
    </p>
  </TabIntro>
);

export const INTRO_PROFIL = (
  <TabIntro>
    <p className="font-medium text-foreground mb-2">
      👤 Ton espace personnel sur DaimBet.
    </p>
    <p>
      Consulte ton portefeuille, ton historique de paris, tes statistiques et gère tes paramètres.
    </p>
  </TabIntro>
);
