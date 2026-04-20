/**
 * Discreet footer line shown on game pages and the bets feed.
 * Intentionally low-contrast, small font — for those who look for it.
 */
export default function ContactFooter() {
  return (
    <p className="text-center text-[11px] text-muted-foreground/70 mt-10 mb-4 px-4">
      Un souci ? Contacte l'admin depuis ton profil → Mes tickets.
    </p>
  );
}
