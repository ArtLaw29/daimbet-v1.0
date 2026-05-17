import type { ReactNode } from 'react';

/**
 * Registry of multiplayer games. Each game registers:
 * - label / emoji shown in lobbies and rooms
 * - min/max players (defaults for new rooms)
 * - optional render of a settings form when creating a room (returns settings JSON)
 * - render of the in-game UI (called when room.status === 'in_progress')
 */
export interface MultiplayerGameDef {
  key: string;
  label: string;
  emoji?: string;
  minPlayers: number;
  maxPlayers: number;
  /** Render the create-room settings form. Receives current settings + onChange. */
  SettingsForm?: (props: {
    value: Record<string, any>;
    onChange: (next: Record<string, any>) => void;
  }) => ReactNode;
  /** Build a human-readable summary of room.settings (shown in the lobby list). */
  summarizeSettings?: (settings: Record<string, any>) => string;
  /** Render the actual game UI inside <GameRoom>. */
  renderGame: (ctx: { roomId: string }) => ReactNode;
}

const registry = new Map<string, MultiplayerGameDef>();

export function registerMultiplayerGame(def: MultiplayerGameDef) {
  registry.set(def.key, def);
}

export function getMultiplayerGame(key: string): MultiplayerGameDef | undefined {
  return registry.get(key);
}

export function listMultiplayerGames(): MultiplayerGameDef[] {
  return [...registry.values()];
}