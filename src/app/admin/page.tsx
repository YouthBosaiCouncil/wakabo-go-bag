"use client";
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth } from '../../lib/adminAuth';
import AdminHub from '../../modules/admin/AdminHub';
import { Notification } from '../../components/ui';
import { Button, IconButton } from '../../components/ui';
import { Sun, Moon, Monitor, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import type { NotificationType } from '../../types';
import '../globals.css';

function AdminContent() {
    const { user, loading, signOut } = useAdminAuth();
    const router = useRouter();
    const [notification, setNotification] = useState<NotificationType>(null);
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!loading && !user) {
            router.replace('/admin/login');
        }
    }, [user, loading, router]);

    if (loading || !user) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8 transition-colors duration-300">
            {notification && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification(null)}
                />
            )}
            <div className="absolute top-4 right-4 flex gap-2 z-50">
                {mounted && (
                    <IconButton
                        onClick={() => {
                            const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
                            setTheme(next);
                        }}
                        className="bg-white dark:bg-gray-800 shadow-lg rounded-full"
                        title="テーマ切り替え"
                    >
                        {resolvedTheme === 'light' && <Sun size={20} className="text-yellow-500" />}
                        {resolvedTheme === 'dark' && <Moon size={20} className="text-blue-400" />}
                        {theme === 'system' && <Monitor size={20} className="text-muted-foreground" />}
                    </IconButton>
                )}
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                        await signOut();
                        router.replace('/admin/login');
                    }}
                    title="ログアウト"
                >
                    <LogOut size={16} className="mr-1" />
                    ログアウト
                </Button>
            </div>
            <div className="max-w-7xl mx-auto">
                <header className="mb-6 flex items-center">
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground">防災持ち出し袋作成支援ツール — 管理者</h1>
                </header>
                <main>
                    <AdminHub setNotification={setNotification} />
                </main>
            </div>
        </div>
    );
}

export default function AdminPage() {
    return (
        <AdminAuthProvider>
            <AdminContent />
        </AdminAuthProvider>
    );
}
