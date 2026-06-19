'use client';

import { api, type ProfileInput, type RegisterInput } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';

export function useAuthActions() {
  const setToken = useSession((s) => s.setToken);
  const setUser = useSession((s) => s.setUser);
  const reset = useSession((s) => s.reset);

  async function login(phone: string, password: string) {
    const res = await api.login({ phone, password });
    setToken(res.token);
    setUser(await api.me(res.token));
    return res;
  }

  async function register(input: RegisterInput) {
    const res = await api.register(input);
    setToken(res.token);
    setUser(await api.me(res.token));
    return res;
  }

  async function updateProfile(token: string, body: ProfileInput) {
    await api.updateProfile(token, body);
    const me = await api.me(token);
    setUser(me);
    return me;
  }

  async function refresh(token: string) {
    try {
      setUser(await api.me(token));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) reset();
    }
  }

  function logout() {
    reset();
  }

  return { login, register, updateProfile, refresh, logout };
}
