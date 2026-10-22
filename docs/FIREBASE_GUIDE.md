# Firebase・本番運用

## 設定

Firebaseは既存の `emergency-go-bag`、Standard / Native mode、`asia-northeast1` を使用します。ローカル検証は別の `demo-wakabo` とエミュレーターを使います。

Authenticationでは匿名認証とメール・パスワードを使用します。実際のVercel配信ドメインを承認済みドメインへ登録してください。

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web APIキー |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Authドメイン |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | クライアントのプロジェクトID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | WebアプリID |
| `FIREBASE_PROJECT_ID` | サーバーの同一プロジェクトID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | サーバー専用アカウントのJSON。Secret変数として保存 |
| `CRON_SECRET` | 32文字以上のランダム値。定期削除APIのBearer認証用Secret |

サーバー用IAM権限は `roles/datastore.user` と `roles/firebaseauth.viewer` に限定します。秘密鍵はGit、チャット、NEXT_PUBLIC変数に入れません。本番ビルドは必須設定、プロジェクトの一致、エミュレーター無効を検査します。

## 管理者

既存の管理者用アカウントを明示して登録します。匿名・一般・テストアカウントへ自動付与しません。

```sh
npx -y firebase-tools@latest login
node scripts/operator.mjs users --project=emergency-go-bag
node scripts/operator.mjs grant-admin --project=emergency-go-bag --uid=ADMIN_UID --apply
```

登録時に既存トークンを失効させるため、管理者は再ログインします。解除時は信頼できるAdmin SDK環境で `admin` クレームを削除して `revokeRefreshTokens(uid)` を呼びます。APIは失効も検証します。運用ツールは動作確認したFirebase CLI 15.34.1の認証をメモリー内で使用します。

## 既存データ移行

```sh
npx tsx scripts/migrate.mts --project=emergency-go-bag
npx tsx scripts/migrate.mts --project=emergency-go-bag --apply
```

最初のコマンドは読み取りだけです。全計画の検証後に適用し、原本の `itemLists`、`PublicSessions`、`trainingSessions` は削除しません。使用中・未使用の教材を `v2Catalogs` へ、セッションを参照専用履歴として `v2Sessions` へコピーします。完了分は同じIDでスキップし、途中失敗も再実行できます。

旧回答にだけ残る品目名は履歴の教材に補完します。編集前の教材自体は復元できないため、現在の教材と旧回答からの再構成です。不正な型や上限超過の回答は黙って捨てず、適用前に停止します。旧4桁コードは継承せず、開催分ごとに新セッションと新しい16桁コードを作成します。履歴のリセット・再受付は行いません。

移行ツールはADC (`GOOGLE_APPLICATION_CREDENTIALS`) または `.private/emergency-go-bag-runtime.json` を使用します。適用直前の原本JSONバックアップもGit除外した `.private/` に保存します。このフォルダーは機密としてアクセスを制限し、必要なバックアップを安全な保管先に移してください。

現在公開中のセッションを継続する初回移行では、dry-runと適用の両方に `--continue-public` を付けます。旧 `isActive: true` が1件だけであることを確認し、そのセッションの回答・集計を引き継いで受付と公開先を設定します。2件以上なら変更せず停止します。再実行しても移行済み回答や管理者が変更した公開先を上書きしません。

## リリース順序

1. Lint・型・単体・エミュレーター・ビルド・本番依存監査を通す。
2. 団体の既存Vercelプロジェクトにサーバー設定を入れ、管理者クレームを確認する。
3. Firestoreルールを全拒否へ変更して旧クライアント書き込みを止める。この時点から旧UIのデータ接続は止まるため、授業・イベント中を避ける。
4. 原本を残して移行し、教材・セッション・回答・集計の件数を照合する。
5. 検証済みmainを配信し、作成→受付→参加→提出→集計を実環境で確認する。

```sh
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project emergency-go-bag
```

全拒否ルールはAdmin SDKのIAMを制限しません。API認可テストも必須です。切り戻し時も、旧包括許可を復活させず、安全なサーバー版または受付停止の状態を使います。

## 継続運用

- セッションは受付終了状態で作成されます。「受付を開始」後、公開型は「トップに公開」を押します。公開対象は単一ポインターで原子的に切り替えます。
- 削除は先に閉鎖し、回答・参加資格・受領記録・コードも削除します。失敗時は管理画面から再試行できます。
- UIDごとのレート制限と、コード参加時のIP制限を使用します。既存SparkプロジェクトではFirestore TTLが課金必須のため、Vercel Cronが毎日18:00 UTC（日本時間3時台）に期限切れ記録を削除します。`CRON_SECRET` を検証し、1回最大8,000件・45秒を目安に処理します。更新中の記録を消さないようトランザクションで期限を再検証します。ログの `hasMore: true` が継続する場合は件数と無料枠を確認して手動実行・上限を調整してください。
- `v2Audit` とAPIのrequest IDで管理操作・障害を追跡します。機密情報はログへ出しません。
- バックアップ/PITR、IAM・鍵、認証アカウント、Vercel利用量・エラーを定期確認してください。PITRの保持・料金方針は運用側で決めます。
- 集計1文書のトランザクションは授業・ワークショップ規模向けです。大規模同時イベントへ拡大する前に負荷試験し、必要ならシャード集計へ変更します。
- WindowsでCLIの証明書エラーが出る場合は `NODE_USE_SYSTEM_CA=1` で信頼済みシステム証明書を使います。TLS検証は無効化しません。
