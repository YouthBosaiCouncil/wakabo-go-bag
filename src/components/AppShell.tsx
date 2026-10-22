"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
export default function AppShell({ children }: { children: ReactNode }) {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8">
      <header className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 mb-8 border-b border-border pb-4">
        <Link href="/" className="font-bold text-lg">
          防災持ち出し袋
        </Link>
        <nav
          aria-label="メインメニュー"
          className="flex flex-wrap items-center gap-4 text-sm"
        >
          <Link href="/">公開セッション</Link>
          <Link href="/join">コードで参加</Link>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded border border-border px-3 py-2"
          >
            テーマ切り替え
          </button>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
