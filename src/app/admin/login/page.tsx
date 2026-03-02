"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, signInWithEmailAndPassword } from '../../../lib/firebase';
import { Card, Button } from '../../../components/ui';
import { LogIn, Mail, Lock } from 'lucide-react';
import '../../../app/globals.css';

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.replace('/admin');
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
                setError('メールアドレスまたはパスワードが正しくありません。');
            } else if (code === 'auth/invalid-email') {
                setError('メールアドレスの形式が正しくありません。');
            } else if (code === 'auth/too-many-requests') {
                setError('ログイン試行が多すぎます。しばらくしてから再試行してください。');
            } else {
                setError('ログインに失敗しました。もう一度お試しください。');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-foreground">管理者ログイン</h1>
                    <p className="text-muted-foreground text-sm mt-1">防災持ち出し袋作成支援ツール</p>
                </div>
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="email" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <Mail size={14} /> メールアドレス
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="admin@example.com"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="password" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <Lock size={14} /> パスワード
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="••••••••"
                        />
                    </div>
                    {error && (
                        <p className="text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
                    )}
                    <Button type="submit" disabled={isLoading} className="w-full mt-1">
                        <LogIn className="mr-2 h-4 w-4" />
                        {isLoading ? 'ログイン中...' : 'ログイン'}
                    </Button>
                </form>
            </Card>
        </div>
    );
}
