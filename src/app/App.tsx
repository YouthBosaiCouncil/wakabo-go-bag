"use client";
import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { auth, onAuthStateChanged, signInAnonymously } from '../lib/firebase';
import { Notification, IconButton, Button } from '../components/ui';
import AdminHub from '../modules/admin/AdminHub';
import JoinSession from '../modules/participant/JoinSession';
import ParticipantMode from '../modules/participant/ParticipantMode';
import ResultsDashboard from '../modules/admin/ResultsDashboard';
import { Sun, Moon, Monitor, Settings, Users } from 'lucide-react';
import type { NotificationType, SessionInfo as SessionInfoType } from '../types';
import './globals.css';

// SessionInfoType は types からインポート

export default function App() {
  const [mode, setMode] = useState<'home' | 'join' | 'admin' | 'lesson' | 'workshop' | 'results'>('home');
  const [sessionInfo, setSessionInfo] = useState<SessionInfoType | null>(null);
  const [notification, setNotification] = useState<NotificationType>(null);
  const [myItems, setMyItems] = useState<string[] | null>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // マウント状態の管理
  useEffect(() => {
    setMounted(true);
  }, []);

  // Firebase認証の設定
  useEffect(() => {
    if (!mounted) return; // マウントされるまで実行しない

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        signInAnonymously(auth).catch((e) => console.error("Anonymous auth failed.", e));
      }
    });
    return () => unsubscribe();
  }, [mounted]); // mountedを依存配列に追加

  const handleJoinSession = (info: SessionInfoType) => { setSessionInfo(info); setMode(info.type); };
  const handleSubmitted = (selected: string[]) => {
    setMyItems(selected);
    // 結果ボードに遷移（参加したセッションの結果）
    setMode('results');
  };
  const goHome = () => { setMode('home'); setSessionInfo(null); };

  const renderContent = () => {
    switch (mode) {
      case 'admin': return <AdminHub setNotification={setNotification} />;
      case 'join': return <JoinSession onJoin={handleJoinSession} />;
      case 'lesson':
        return sessionInfo ? (
          <ParticipantMode info={{
            type: sessionInfo.type,
            team: undefined,
            session: { id: sessionInfo.sessionId, name: sessionInfo.sessionName },
            itemList: { name: sessionInfo.itemList.name, items: sessionInfo.itemList.items },
          }} setNotification={setNotification} onSubmitted={handleSubmitted} />
        ) : null;
      case 'workshop':
        return sessionInfo ? (
          <ParticipantMode info={{
            type: sessionInfo.type,
            team: undefined,
            session: { id: sessionInfo.sessionId, name: sessionInfo.sessionName },
            itemList: { name: sessionInfo.itemList.name, items: sessionInfo.itemList.items },
          }} setNotification={setNotification} onSubmitted={handleSubmitted} />
        ) : null;
      case 'results': return (
        sessionInfo ? (
          <ResultsDashboard
            session={{ id: sessionInfo.sessionId, name: sessionInfo.sessionName, type: sessionInfo.type }}
            itemList={sessionInfo.itemList}
            onBack={() => setMode(sessionInfo.type)}
          />
        ) : null
      );
      default:
        return (
          <div className="w-full max-w-5xl mx-auto text-center">
            <div className="mb-12 pt-8">
              <h1 className="text-4xl md:text-5xl font-extrabold text-foreground">防災持ち出し袋</h1>
              <h2 className="text-4xl md:text-5xl font-extrabold text-blue-500 mb-4">作成支援ツール</h2>
            </div>
            <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
              <button onClick={() => setMode('join')} className="w-full py-4 text-xl bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold flex items-center justify-center">
                {mounted ? (
                  <Users className="mr-2" />
                ) : (
                  <span className="mr-2 inline-block w-6" aria-hidden />
                )}
                セッションに参加する
              </button>
            </div>
          </div>
        );
    }
  };

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
              const currentTheme = theme || 'system';
              const nextTheme = currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'system' : 'light';
              setTheme(nextTheme);
            }}
            title={`現在: ${theme === 'light' ? 'ライト' : theme === 'dark' ? 'ダーク' : 'システム'}モード | 解決済み: ${resolvedTheme || 'unknown'} (クリックで切り替え)`}
            className="relative bg-white dark:bg-gray-800 shadow-lg rounded-full"
          >
            {mounted && resolvedTheme === 'light' && <Sun size={24} className="text-yellow-500" />}
            {mounted && resolvedTheme === 'dark' && <Moon size={24} className="text-blue-400" />}
            {mounted && theme === 'system' && <Monitor size={24} className="text-muted-foreground" />}
          </IconButton>
        )}
        {mounted && (mode === 'home' || mode === 'join') && (
          <IconButton onClick={() => setMode('admin')} title="管理者モード">
            <Settings size={24} />
          </IconButton>
        )}
      </div>

      {mode === 'home' || mode === 'join' ? (
        <div className="flex justify-center items-center min-h-[80vh]">{renderContent()}</div>
      ) : (
        <div className="max-w-7xl mx-auto">
          <header className="mb-6 flex justify-between items-center relative">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground cursor-pointer" onClick={goHome}>防災持ち出し袋作成支援ツール</h1>
            <Button onClick={goHome} variant="secondary">ホームに戻る</Button>
          </header>
          <main>{renderContent()}</main>
        </div>
      )}
    </div>
  );
}
