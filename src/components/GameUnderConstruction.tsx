interface Props {
  gameName: string;
}

export default function GameUnderConstruction({ gameName }: Props) {
  return (
    <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center gap-4 min-h-[60vh]">
      <div className="text-7xl">🚧</div>
      <h1 className="font-display text-3xl gold-text">{gameName}</h1>
      <p className="text-muted-foreground text-lg">Jeu en construction, à très vite !</p>
    </div>
  );
}