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
      Oublie ton CV : ici, ta connaissance des potins vaut de l'or et ton instinct est ton seul actif.
    </p>
    <ul className="mt-3 space-y-1 text-xs list-disc list-inside">
      <li>📊 <strong>Pari mutuel</strong> — les cotes évoluent en temps réel selon les mises</li>
      <li>💰 Mise max : <strong>30% du capital</strong> (15% pour les paris long terme)</li>
      <li>🔒 Cote définitive figée à la <strong>clôture</strong> des mises</li>
      <li>↩️ <strong>Droit de Remords</strong> — possibilité de rétractation avant clôture</li>
    </ul>
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
