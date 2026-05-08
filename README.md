# たいおんログ (TaionLog)

家族向け 体温記録 PWA + GAS バックエンド (React + TypeScript + Vite)。

体温・投薬記録の家族間共有、AI による服薬解説・問診票生成・受診相談など。

---

## アーキテクチャ概要

```
[ブラウザ (PWA)]
     │
     ├── IndexedDB (オフライン優先、ローカル保管)
     │
     ├── fetch ──→ [GAS Web App (doPost)]
     │                │
     │                └── [Spreadsheet]  ← データ永続化
     │
     └── fetch ──→ [Gemini API / Groq API]   ← AI は端末から直接呼び出し
                       (ユーザー個別の API キーを使用)
```

主要技術:

- **フロント**: React 19, TypeScript, Vite 7, react-router-dom v7, idb, recharts, react-markdown
- **AI**: Google Generative AI (Gemini) + Groq SDK（クライアント直接呼び出し）
- **バックエンド**: Google Apps Script (Web App) + Spreadsheet
- **配信**: Cloudflare Pages
- **PWA**: vite-plugin-pwa

---

## セットアップ手順

### 1. ローカル開発

```bash
npm install

# 環境変数ファイルを作成（テンプレートをコピーして値を埋める）
cp .env.example .env
# エディタで .env を開き、VITE_GAS_BASE_URL と VITE_API_SECRET を設定

npm run dev
```

`.env` は Git 管理外です（`.gitignore` で除外済み）。

### 2. GAS バックエンドの設定

GAS プロジェクトの「プロジェクト設定」>「スクリプトプロパティ」で次の3つを設定:

| プロパティ名      | 値                                                      |
| --------------- | ------------------------------------------------------- |
| `SPREADSHEET_ID` | データ保存先のスプレッドシート ID                          |
| `API_SECRET`    | クライアントと共有する認証キー（32文字以上のランダム文字列推奨） |
| `ADMIN_SECRET`  | 管理者専用の鍵（**API_SECRET とは別の値にすること**）       |

> ⚠️ **`ADMIN_SECRET` と `API_SECRET` は必ず異なる値にしてください。**
> 同じ値だと、`rotateSecret` 機能による API キー保護が無効化されます。

「デプロイ」>「新しいデプロイ」>「ウェブアプリ」で公開すると `https://script.google.com/macros/s/.../exec` の URL が発行されます。これを `VITE_GAS_BASE_URL` に設定してください。

### 3. Cloudflare Pages の設定

プロジェクト設定 > 「変数とシークレット」で次の2つを設定:

| 名前                  | タイプ       | 値の例                                                    |
| -------------------- | ----------- | ---------------------------------------------------------- |
| `VITE_GAS_BASE_URL`  | プレーンテキスト | `https://script.google.com/macros/s/.../exec`             |
| `VITE_API_SECRET`    | プレーンテキスト | `MyTaionLogSecret2025Key` （GAS の `API_SECRET` と同値）   |

#### 🔐 セキュリティ上の重要事項

`VITE_*` で始まる環境変数は **ビルド時にクライアント JS にそのまま埋め込まれます**。
Cloudflare 側で「シークレット」型に設定しても、ブラウザに配信される時点で値は露出します。

つまり `VITE_API_SECRET` は「真のシークレット」ではなく、
**簡易な共有秘密キーによる軽い保護**として機能します。
これは攻撃者がリバースエンジニアリングすれば取得可能であることを承知の上で運用する設計です。

本物の認証（個人情報レベル）が必要になった場合は:
- OAuth / Firebase Auth 等のトークン認証への移行
- GAS 側でのレート制限・IP 制限の併用
- 機密データ自体をクライアントに渡さない設計

を検討してください。

なお `VITE_GAS_BASE_URL` は URL なので公開されても問題ありません（GAS 側で `API_SECRET` チェックがあるため）。

### 4. AI API キーの設定

AI 機能（お薬解説、問診票生成、ホームケア相談）は **ユーザー個別** に Gemini / Groq の API キーを発行して、アプリ内の「設定 > AI機能の設定」画面から登録します。
キーは **端末ローカル（IndexedDB）に保管** され、サーバー側にはアップロードされません。

---

## ビルド & デプロイ

```bash
npm run build       # dist/ にビルド成果物を出力
npm run preview     # ビルド結果をローカルで確認

# Cloudflare Pages にデプロイ（Git push が自動デプロイをトリガー）
git add .
git commit -m "release: vX.Y.Z"
git push origin main
```

`vite.config.ts` で git の HEAD コミットハッシュとコミット日時を `__APP_VERSION__` / `__APP_UPDATED_AT__` に静的注入しているため、ビルドの度にバージョン情報が自動更新されます（設定画面下部に表示）。

---

## ディレクトリ構成

```
src/
├── app/                  # ルーティング・PWA・アプリ全体設定
├── config/               # 設定値の SSOT (AI モデル名等)
├── data/
│   ├── local/            # IndexedDB アクセス層
│   └── remote/           # GAS / AI への HTTP クライアント
├── features/
│   ├── chart/            # 体温グラフ
│   └── settings/         # 設定画面群
├── security/             # 端末識別子
├── services/
│   ├── notifications/    # Tier0 (アラーム) / Tier1 (PWA push)
│   └── sync/             # GAS 双方向同期
├── ui/
│   ├── components/       # 共通コンポーネント
│   ├── pages/            # 画面
│   └── tokens.ts         # 色・スタイル定数
├── utils/                # 共通ユーティリティ (パース、日付、payload 抽出)
├── main.tsx              # エントリーポイント
└── index.css
```

---

## 既知の留意点

### `VITE_*` 環境変数の制約

ビルド時に静的に埋め込まれるため、本番デプロイ後に値を変えるには **再ビルド + 再デプロイ** が必須です。
ランタイムでの動的な値変更には対応していません。

### IndexedDB のサイズ制限

`pruneLocalEventsIfNeeded()` で同期済みイベント 10,000 件超は古い順に自動削除されます。
完全な履歴はスプレッドシート側に残ります。

### AI 機能のフォールバック

Gemini で失敗した場合は自動的に Groq にフォールバックします（設定で OFF 可）。
両方失敗すると `AiCallError` が throw され、UI 側で `provider/stage` 付きのエラー表示が出ます。
