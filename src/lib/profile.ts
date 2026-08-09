import { pb } from './pocketbase';
import type { AppUser } from '../types';

export function getProfileDisplayName(user: Pick<AppUser, 'name' | 'email'> | null | undefined): string {
  return user?.name?.trim() || user?.email?.split('@')[0] || 'You';
}

export function getProfileAvatarLabel(user: Pick<AppUser, 'name' | 'email'> | null | undefined): string {
  return getProfileDisplayName(user).charAt(0).toUpperCase();
}

export function getProfileAvatarUrl(user: Pick<AppUser, 'id' | 'avatar'> | null | undefined): string | null {
  if (!user?.avatar) {
    return null;
  }
  return pb.files.getURL(user as any, user.avatar);
}