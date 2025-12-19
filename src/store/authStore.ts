import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface AuthState {
  user: User | null;
  session: any | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: any | null) => void;
  initialize: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('wh_user') || 'null'),
  session: null,
  isLoading: true,

  setUser: (user) => {
    if (user) {
      localStorage.setItem('wh_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('wh_user');
    }
    set({ user });
  },

  setSession: (session) => set({ session }),

  initialize: async () => {
    // 1. Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    set({ session, isLoading: false });

    // 2. Setup listener
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      if (!session) {
        // Optional: clear user if session expires, but keep backward compat for now
        // set({ user: null }); 
      }
    });
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('wh_user');
    set({ user: null, session: null });
  }
}));
