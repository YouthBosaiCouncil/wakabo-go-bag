# 設計・検証

| 場所 | 責務 |
| --- | --- |
| `src/domain/` | Zod契約、選択範囲、集計差分、CSV |
| `src/server/http.ts` | IDトークン・失効・管理者・origin・JSON上限・レート制限 |
| `src/server/service.ts` | DBパス、教材・セッション操作、参加資格、回答と集計 |
| `src/server/firebase-admin.ts` | サーバー専用Firebase初期化 |
| `src/lib/firebase.ts` | ブラウザのAuthのみ。Firestore/Functionsを読み込まない |
| `src/lib/api.ts` | 認証準備を待ってBearerトークンを付けるHTTPクライアント |
| `src/modules/` | 参加・管理UI。DBへ直接アクセスしない |
| `scripts/` | 明示プロジェクト指定の運用・移行・エミュレーターseed |

パスは `artifacts/{projectId}/public/data` 配下です。旧来の `public` という文字列は公開権限を意味しません。

| コレクション | 内容 |
| --- | --- |
| `v2Catalogs` / `versions` | 教材とバージョン履歴 |
| `v2Sessions` | セッション、固定教材、受付状態、開催回 |
| `v2Sessions/{id}/teams` | チーム番号・コード。管理者のみが取得 |
| `v2Sessions/{id}/members` | UID・チームに対応する参加資格 |
| `v2Sessions/{id}/answers` | 検証済み生回答 |
| `v2Sessions/{id}/receipts` | UID・チーム・開催回・回答IDごとの受領記録 |
| `v2Sessions/{id}/aggregates/current` | 回答数/提出チーム数、品目ID別選択数 |
| `v2Invites` | 参加コードのSHA-256による索引 |
| `v2Settings/public` | 公開セッションID |
| `v2RateLimits` / `v2Audit` | 共有レート制限・管理操作履歴 |

参加者APIは固定教材・自分のチーム情報・集計だけを返します。別タブで別チームに参加しても、回答payloadのチーム・開催回と参加資格を照合して保存します。

## 自動検証

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:emulator
npm run build
npm audit --omit=dev
```

単体テストは入力・CSV式注入・履歴変換を検証します。実Firestore/Authエミュレーターで、直接アクセス全拒否、偽トークン・一般アカウント拒否、管理者操作、チーム境界、再送・同時提出・削除・移行を検証します。エミュレーター未設定時には実Firebaseへ接続せず失敗します。

`.github/workflows/verify.yml` がmain/PRで同じ検証を行います。ActionsはSHAに固定し、CIへ本番鍵を渡しません。開発ツールだけに残る監査警告と本番依存を分けて扱います。

## UI検証用データ

```sh
npx -y firebase-tools@latest emulators:start --project demo-wakabo --only auth,firestore
# 別ターミナルで FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 と FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 を設定
npx tsx scripts/seed-emulator.mts
```

Next側の `FIREBASE_PROJECT_ID` と `NEXT_PUBLIC_FIREBASE_PROJECT_ID` は `demo-wakabo`、`NEXT_PUBLIC_USE_EMULATORS=true` とダミーWeb設定を使います。seedの `qa-admin@example.test` のパスワードは `local-only-test-password` で、ローカル専用です。

初回認証、公開/コード/チーム参加、連続回答、チーム再提出、閉鎖・再試行、教材編集、CSV、キーボード、モーダルのEscape/フォーカス復帰、スマートフォン幅、ダークモード、コンソールを確認します。実機Safariと大規模負荷試験は別途必要です。
