export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
// Keep in sync with the profiles_username_reserved constraint in Supabase.
const RESERVED_USERNAME_PATTERN = /^(admin|amerikano|destek|support|moderat|yonetic|yetkili|sistem|system|official|resmi|hegion|staff|root)/;
export const RESERVED_USERNAME_MESSAGE = 'Bu kullanıcı adı ayrılmış. Başka bir tane dene.';

export function normalizeUsername(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

export function usernameError(value: string) {
  if (value.length < USERNAME_MIN_LENGTH || value.length > USERNAME_MAX_LENGTH) {
    return 'Kullanıcı adı 3–20 karakter olmalı.';
  }
  if (!/^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(value)) {
    return 'Kullanıcı adı harf veya rakamla başlamalı ve bitmeli.';
  }
  if (RESERVED_USERNAME_PATTERN.test(value)) return RESERVED_USERNAME_MESSAGE;
  return '';
}
