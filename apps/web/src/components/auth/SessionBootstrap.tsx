'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';

/** Validates a persisted token on load and populates the profile (or clears on 401). */
export function SessionBootstrap() {
  const setUser = useSession((s) => s.setUser);
  const reset = useSession((s) => s.reset);

  useEffect(() => {
    const token = useSession.getState().token;
    if (!token) return;
    let active = true;
    api
      .me(token)
      .then((me) => {
        if (active) setUser(me);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) reset();
      });
    return () => {
      active = false;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
