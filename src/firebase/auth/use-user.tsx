'use client';

import { useFirebase } from '@/firebase/provider';
import type { UserHookResult } from '@/firebase/provider';


/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => {
  const firebase = useFirebase();
  if (!firebase) {
    return { user: null, isUserLoading: false, userError: null };
  }
  return { user: firebase.user, isUserLoading: firebase.isUserLoading, userError: firebase.userError };
};
