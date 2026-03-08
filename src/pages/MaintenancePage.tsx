import daimcoinLogo from '@/assets/daimcoin-logo.png';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <img src={daimcoinLogo} alt="" className="w-20 h-20 rounded-full mb-6 opacity-60" />
      <h1 className="text-3xl font-display gold-text mb-4">Maintenance en cours</h1>
      <p className="text-lg text-foreground max-w-md leading-relaxed">
        🦌 DaimBet fait une petite pause pour s'améliorer. On revient très vite — garde tes DAIMcoins au chaud ! 💸
      </p>
      <p className="text-sm text-muted-foreground mt-8">
        L'équipe DaimBet travaille dur pour améliorer ton expérience.
      </p>
    </div>
  );
}
