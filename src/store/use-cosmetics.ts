import { useStore } from '@/network/store';
import { useGameSettings } from '@/settings/game-settings';
import { CARD_BACKS, DEFAULT_CARD_BACK, DEFAULT_FELT, FELTS, ownsCosmetic } from './catalog';

/** The equipped designs, falling back to the defaults when this account does not own them. */
export function useEquippedCosmetics() {
  const { settings } = useGameSettings();
  const { items } = useStore();
  const cardBackId = ownsCosmetic(settings.cardBack, items) ? settings.cardBack : DEFAULT_CARD_BACK;
  const feltId = ownsCosmetic(settings.felt, items) ? settings.felt : DEFAULT_FELT;
  return {
    cardBack: CARD_BACKS.find(item => item.id === cardBackId)!,
    felt: FELTS.find(item => item.id === feltId)!,
  };
}
