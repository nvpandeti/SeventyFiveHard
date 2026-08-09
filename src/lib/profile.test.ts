import { describe, expect, it } from 'vitest';
import { createPocketBaseFilePart, getPocketBaseMimeType, normalizePocketBaseFileName } from './pocketbaseFile';
import { getProfileAvatarLabel, getProfileDisplayName } from './profile';

describe('profile helpers', () => {
  it('formats display names with sensible fallbacks', () => {
    expect(getProfileDisplayName({ name: '  Ada Lovelace  ', email: 'ada@example.com' })).toBe('Ada Lovelace');
    expect(getProfileDisplayName({ email: 'ada@example.com' })).toBe('ada');
    expect(getProfileDisplayName(null)).toBe('You');
  });

  it('derives avatar labels from the display name', () => {
    expect(getProfileAvatarLabel({ name: 'ada', email: 'ada@example.com' })).toBe('A');
    expect(getProfileAvatarLabel({ email: 'friend@example.com' })).toBe('F');
  });
});

describe('PocketBase file helpers', () => {
  it('normalizes filenames and MIME types from file URIs', () => {
    expect(normalizePocketBaseFileName('file:///tmp/Avatar.JPG?foo=1')).toBe('Avatar.JPG');
    expect(getPocketBaseMimeType('Avatar.JPG')).toBe('image/jpeg');

    const filePart = createPocketBaseFilePart('file:///tmp/Avatar.JPG?foo=1', 'avatar');

    expect(filePart).toEqual({
      uri: 'file:///tmp/Avatar.JPG?foo=1',
      name: 'Avatar.JPG',
      type: 'image/jpeg',
    });
  });

  it('falls back to jpeg for unknown extensions', () => {
    expect(getPocketBaseMimeType('avatar.raw')).toBe('image/jpeg');
  });
});