export default function SectionSuspendedMessage() {
  return (
    <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center gap-3 min-h-[60vh]">
      <div className="text-7xl">⏸️</div>
      <h1 className="font-display text-2xl gold-text">Section temporairement suspendue</h1>
      <p className="text-muted-foreground text-base max-w-md">
        Cette section est momentanément suspendue par l'administrateur. Reviens bientôt !
      </p>
    </div>
  );
}