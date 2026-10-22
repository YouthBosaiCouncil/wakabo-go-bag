"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { clientAuth } from "./firebase";
const Context = createContext<{
  user: User | null;
  loading: boolean;
  error: string;
  signOut: () => Promise<void>;
}>({ user: null, loading: true, error: "", signOut: async () => {} });
export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    user: User | null;
    loading: boolean;
    error: string;
  }>({ user: null, loading: true, error: "" });
  useEffect(() => {
    let active = true;
    let sequence = 0;
    try {
      const unsubscribe = onIdTokenChanged(clientAuth(), async (user) => {
        const current = ++sequence;
        try {
          const token =
            user && !user.isAnonymous ? await user.getIdTokenResult() : null;
          if (active && current === sequence)
            setState({
              user: token?.claims.admin === true ? user : null,
              loading: false,
              error:
                user && !user.isAnonymous && token?.claims.admin !== true
                  ? "このアカウントには管理者権限がありません。"
                  : "",
            });
        } catch {
          if (active && current === sequence)
            setState({
              user: null,
              loading: false,
              error: "認証状態の確認に失敗しました。",
            });
        }
      });
      return () => {
        active = false;
        unsubscribe();
      };
    } catch (error) {
      setState({
        user: null,
        loading: false,
        error: error instanceof Error ? error.message : "認証設定エラー",
      });
    }
  }, []);
  return (
    <Context.Provider
      value={{ ...state, signOut: () => signOut(clientAuth()) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAdminAuth = () => useContext(Context);
