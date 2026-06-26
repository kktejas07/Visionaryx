export type Role = 'admin' | 'operator' | 'enrollee';

export interface UserModel {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  created_at?: string;
}
