"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, onAuthStateChanged, signOut as firebaseSignOut } from './firebase';
import type { User } from './firebase';

interface AdminAuthContextValue {
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue>({
    user: null,
    loading: true,
    signOut: async () => {},
});

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            // 匿名ユーザーは管理者として扱わない
            setUser(u && !u.isAnonymous ? u : null);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const signOut = async () => {
        await firebaseSignOut(auth);
    };

    return (
        <AdminAuthContext.Provider value={{ user, loading, signOut }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    return useContext(AdminAuthContext);
}
