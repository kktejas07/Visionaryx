import { api, publicApi, setStoredToken, clearStoredToken, apiWithToken } from '@/lib/api';
import type { UserModel } from '@/viewmodels/models/UserModel';

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export const AuthRepository = {
  async login({ email, password, rememberMe = false }: LoginPayload): Promise<UserModel> {
    const tokens = await publicApi<AuthTokens>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          expires_in_days: rememberMe ? 30 : 1,
        }),
      },
      30_000,
    );
    await setStoredToken(tokens.access_token);
    try {
      return await apiWithToken<UserModel>(tokens.access_token, '/api/v1/auth/me');
    } catch (e) {
      await clearStoredToken();
      throw e;
    }
  },

  async me(): Promise<UserModel> {
    return api<UserModel>('/api/v1/auth/me');
  },

  async logout(): Promise<void> {
    await clearStoredToken();
  },

  async forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
    return publicApi('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  },

  async changePassword(current: string, next: string): Promise<{ ok: boolean }> {
    return api('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
  },
};
