// Metro needs literal require paths for bundled local images.
export const avatarPortraits = {
  lara: require('../../assets/avatars/character-lara.png') as number,
  kemal: require('../../assets/avatars/character-kemal.png') as number,
  emir: require('../../assets/avatars/character-emir.png') as number,
  ada: require('../../assets/avatars/character-ada.png') as number,
  elif: require('../../assets/avatars/character-elif.png') as number,
  can: require('../../assets/avatars/character-can.png') as number,
  selin: require('../../assets/avatars/character-selin.png') as number,
  murat: require('../../assets/avatars/character-murat.png') as number,
  nermin: require('../../assets/avatars/character-nermin.png') as number,
} as const;
