// Metro needs literal require paths for bundled local images.
export const avatarPortraits = {
  lara: require('../../assets/avatars/character-lara.png') as number,
  kemal: require('../../assets/avatars/character-kemal.png') as number,
  emir: require('../../assets/avatars/character-emir.png') as number,
  ada: require('../../assets/avatars/character-ada.png') as number,
} as const;
