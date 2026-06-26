import { useCallback, useState } from 'react';
import { AuthRepository } from './repositories';
import { useAuth } from '@/contexts/AuthContext';

export interface LoginViewModel {
  email: string;
  password: string;
  showPassword: boolean;
  rememberMe: boolean;
  busy: boolean;
  error: string | null;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  toggleShowPassword: () => void;
  toggleRemember: () => void;
  submit: () => Promise<boolean>;
  recover: () => Promise<string | null>;
  clearError: () => void;
}

export function useLoginViewModel(): LoginViewModel {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShow] = useState(false);
  const [rememberMe, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter email and password.');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return false;
    }
    setBusy(true);
    try {
      await login(email.trim(), password, rememberMe);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const looksLikeCreds = /invalid|password|email|account/i.test(msg);
      setError(looksLikeCreds ? 'Invalid credentials. Try again.' : msg);
      return false;
    } finally {
      setBusy(false);
    }
  }, [email, password, rememberMe, login]);

  const recover = useCallback(async () => {
    if (!email.trim()) {
      setError('Enter your email first to start recovery.');
      return null;
    }
    setBusy(true);
    try {
      const r = await AuthRepository.forgotPassword(email);
      return r.message;
    } catch {
      setError('Recovery failed. Try again later.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [email]);

  return {
    email,
    password,
    showPassword,
    rememberMe,
    busy,
    error,
    setEmail: (v) => {
      setEmail(v);
      if (error) setError(null);
    },
    setPassword: (v) => {
      setPassword(v);
      if (error) setError(null);
    },
    toggleShowPassword: () => setShow((s) => !s),
    toggleRemember: () => setRemember((s) => !s),
    submit,
    recover,
    clearError: () => setError(null),
  };
}
