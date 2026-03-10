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
    <p className="font-semibold text-foreground mb-2">
      Bienvenue sur le premier marché de prédiction de la promo.
    </p>
    <p>
      Oublie ton CV : ici, ta connaissance de la promo vaut de l'or, et ton instinct fait le reste.
    </p>
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
      <p className="text-sm text-foreground">
        🛡️ Tous les paris sont modérés, leur résolution est assurée par Jordaim Belfort, et une règle est sacrée sur DaimBet : <strong>on rigole ensemble, jamais aux dépens de quelqu'un.</strong> 🤝
      </p>
    </div>
    <ul className="mt-3 space-y-1 text-xs list-disc list-inside">
      <li>📊 <strong>Pari mutuel</strong> — les cotes évoluent en temps réel selon les mises de la promo</li>
      <li>💰 <strong>Mise max</strong> — 30 % de ton solde (15 % pour les paris long terme)</li>
      <li>🔒 <strong>Cotes figées à la clôture des mises</strong> — ton gain final est calculé à ce moment-là</li>
      <li>↩️ <strong>Option de rétractation</strong> — tu peux annuler ta mise dès le lendemain, pendant la plage horaire autorisée</li>
    </ul>
    <div className="mt-4 pt-3 border-t border-border/50">
      <p className="font-semibold text-foreground mb-2">Comment lire une cote ?</p>
      <p>
        Cote haute (ex : 4.5) → peu de parieurs y croient, gros gains possibles.
        Cote basse (ex : 1.2) → tout le monde y croit, faibles gains.
        À toi de lire la promo mieux que les autres.
      </p>
    </div>
    <hr className="my-3 border-border/50" />
    <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
      ⓘ DaimBet est une initiative personnelle, mise à disposition de la promotion DAIM à titre gratuit et dans un esprit exclusivement ludique. Aucune transaction financière réelle n'est impliquée — la monnaie est entièrement fictive. Chaque utilisateur est responsable des propositions qu'il soumet et des messages qu'il publie. En s'inscrivant, chaque utilisateur s'engage à contribuer dans un esprit humoristique et bienveillant.
    </p>
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
