"use client";
import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  db,
  appId,
  auth,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onAuthStateChanged,
  signInAnonymously,
} from "../lib/firebase";
import ParticipantMode from "../modules/participant/ParticipantMode";
import ResultsDashboard from "../modules/admin/ResultsDashboard";
import { Notification } from "../components/ui";
import { Sun, Moon, Monitor } from "lucide-react";
import type { NotificationType, ItemList, SessionInfo } from "../types";
import "./globals.css";

type Phase = "loading" | "error" | "participating" | "results";

export default function PublicPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [notification, setNotification] = useState<NotificationType>(null);
  const [myItems, setMyItems] = useState<string[]>([]);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 匿名認証
  useEffect(() => {
    if (!mounted) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((e) =>
          console.error("Anonymous auth failed.", e)
        );
      }
    });
    return () => unsubscribe();
  }, [mounted]);

  // isActive な PublicSession を取得して自動参加
  useEffect(() => {
    if (!mounted) return;

    const load = async () => {
      try {
        const q = query(
          collection(db, "artifacts", appId, "public", "data", "PublicSessions"),
          where("isActive", "==", true)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setErrorMessage("現在、公開中のセッションはありません。");
          setPhase("error");
          return;
        }

        const sessionDoc = snapshot.docs[0];
        const data = sessionDoc.data() as {
          name?: string;
          itemListId?: string;
        };

        if (!data.itemListId) {
          setErrorMessage(
            "セッションのアイテムリストが設定されていません。管理者にお問い合わせください。"
          );
          setPhase("error");
          return;
        }

        const itemListSnap = await getDoc(
          doc(db, "artifacts", appId, "public", "data", "itemLists", data.itemListId)
        );

        if (!itemListSnap.exists()) {
          setErrorMessage(
            "アイテムリストが見つかりません。管理者にお問い合わせください。"
          );
          setPhase("error");
          return;
        }

        const itemList = { id: itemListSnap.id, ...itemListSnap.data() } as ItemList;

        setSessionInfo({
          type: "workshop",
          sessionId: sessionDoc.id,
          sessionName: data.name ?? "",
          itemList,
          sessionCollection: "PublicSessions",
        });
        setPhase("participating");
      } catch (e) {
        console.error(e);
        setErrorMessage(
          "セッションの読み込み中にエラーが発生しました。ページを再読み込みしてください。"
        );
        setPhase("error");
      }
    };

    load();
  }, [mounted]);

  const handleSubmitted = (selected: string[]) => {
    setMyItems(selected);
    setPhase("results");
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

      {/* テーマ切り替えボタン */}
      {mounted && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => {
              const next =
                theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
              setTheme(next);
            }}
            className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg"
            title="テーマ切り替え"
          >
            {resolvedTheme === "light" && <Sun size={20} className="text-yellow-500" />}
            {resolvedTheme === "dark" && <Moon size={20} className="text-blue-400" />}
            {theme === "system" && <Monitor size={20} className="text-muted-foreground" />}
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            <p className="text-muted-foreground">セッションを読み込み中...</p>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-400 rounded-xl px-6 py-5 max-w-md text-center">
              <p className="text-red-600 dark:text-red-400 font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        {phase === "participating" && sessionInfo && (
          <ParticipantMode
            info={{
              type: "workshop",
              session: { id: sessionInfo.sessionId, name: sessionInfo.sessionName },
              itemList: {
                name: sessionInfo.itemList.name,
                items: sessionInfo.itemList.items,
              },
              sessionCollection: "PublicSessions",
            }}
            setNotification={setNotification}
            onSubmitted={handleSubmitted}
          />
        )}

        {phase === "results" && sessionInfo && (
          <ResultsDashboard
            session={{
              id: sessionInfo.sessionId,
              name: sessionInfo.sessionName,
              type: "workshop",
            }}
            itemList={sessionInfo.itemList}
            onBack={() => setPhase("participating")}
            sessionCollection="PublicSessions"
          />
        )}
      </div>
    </div>
  );
}
