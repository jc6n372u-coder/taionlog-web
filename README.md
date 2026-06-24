# たいおんログ (TaionLog)

家族向け体温記録PWAとGoogle Apps Scriptバックエンドです。フロントエンドはReact、TypeScript、Viteで構成し、共有データはGoogleスプレッドシートへ保存します。

## アーキテクチャ

```text
ブラウザ／PWA
  ├─ IndexedDB
  │   ├─ 業務データ
  │   ├─ sync_queue       未送信変更
  │   └─ sync_conflicts   競合保留
  ├─ GAS Webアプリ
  │   └─ Googleスプレッドシート
  └─ Gemini／Groq API
      └─ 利用者自身のAPIキーで端末から直接通信
```

同期はローカル保存を先に完了し、その後バックグラウンドで実行します。アプリ表示中は30秒ごと、アプリ再表示時は直前の同期時刻にかかわらず即時、オンライン復帰時、ローカル変更後に同期します。

## 同期の安全設計

- Push対象は端末時刻と`last_sync`の比較ではなく、IndexedDBの`sync_queue`で管理します。
- 旧同期方式から初めて新版を起動したグループでは、Push前に共有側全件を取得して端末内データと照合します。同一内容は共有側のサーバー時刻へ正規化し、端末だけにある行は送信待ち、内容が異なる行は競合として保持します。
- 1回のPushは100件以下へ分割し、GASの受理履歴上限200件の処理中に同一リクエスト内の受理結果が押し出されないようにします。
- GASが受理した更新にはGAS側のサーバー時刻を`updated_at`として設定します。
- Pullカーソルは`sync_pull_cursor`へ保存し、画面表示用の最終成功時刻はGASが返した`server_cursor`を`last_sync_success_at`へ別保存します。端末時計は最終同期表示に使用しません。
- 同じデータが別端末でも変更されていた場合は、GASで競合として返し、自動上書きしません。
- 競合時は画面で「共有側を使用」または「この端末を反映」を選択します。
- 同期通信中に同じデータを再編集した場合も、新しい編集内容を未送信として保持します。
- GASは`_client_change_id`の受理結果を24時間以内・最大200件の範囲で保持し、応答消失後の同一Push再送を重複更新や偽競合にしません。
- 新規端末では共有設定の初期値を自動保存せず、サーバー取得前は表示用の仮既定値だけを使用します。

## IndexedDBの容量整理

イベント総数が10,000件を超えた場合、次の条件をすべて満たす古いイベントだけを端末から物理削除します。

- `is_deleted === 1`
- `synced_at`が存在する
- 未送信キューに存在しない
- 競合保留中ではない

有効なイベントは自動削除しません。削除対象が不足する場合は10,000件未満まで減らなくても処理を終了します。クラウド上のデータは削除しません。

## 必要な環境変数

### ローカル開発とCloudflare Pages

| 名前 | 内容 |
|---|---|
| `VITE_GAS_BASE_URL` | GAS WebアプリURL |
| `VITE_API_SECRET` | GASの`API_SECRET`と同じフロント用共有キー |

`VITE_*`はビルド時にブラウザ配信物へ埋め込まれます。`VITE_API_SECRET`は真の秘密情報ではなく、簡易な共有キーです。値を変更した場合はCloudflare Pagesで再ビルド・再デプロイしてください。

### GASスクリプトプロパティ

| 名前 | 内容 |
|---|---|
| `SPREADSHEET_ID` | データ保存先スプレッドシートID |
| `API_SECRET` | 現在のフロント用共有キー |
| `API_SECRET_PREVIOUS` | 無停止切替期間だけ許可する旧キー。切替完了後に削除 |
| `ADMIN_SECRET` | 管理者専用キー。`API_SECRET`および`API_SECRET_PREVIOUS`と異なる値 |
| `SYNC_SERVER_TIMESTAMP_V1` | 移行関数実行後に自動設定される管理フラグ |

`ADMIN_SECRET`はフロントエンド、Cloudflare Pages、IndexedDBへ登録しません。`scripts/manage-gas-secrets.ps1`の`GenerateAdmin`で候補値を生成し、GASのスクリプトプロパティへだけ登録します。

## 初回の同期時刻移行

新しい同期方式を有効にする前に、GASエディタから`migrateSyncUpdatedAtToServerTimeOnce`を1回だけ実行します。

実行前に次を満たしてください。

1. 利用中の全端末で旧版の手動同期を完了する。
2. 以後、新版公開まで入力を停止する。
3. スプレッドシートのバックアップを作成する。
4. 新しい`Code.gs`をGASへ保存する。ただし、この時点ではWebアプリの新バージョンを公開しない。
5. `migrateSyncUpdatedAtToServerTimeOnce`をGASエディタから実行する。
6. 実行結果が`status: done`または`status: already_done`であることを確認する。
7. その後にGAS Webアプリとフロントエンドを公開する。

この移行は共有対象シートの`updated_at`をGAS基準時刻へ統一します。シートや列は追加・削除しません。新版を各端末で初回起動した際は、グループ単位で共有側全件と端末内データを自動照合し、旧同期方式で取り残された端末内変更を送信待ちまたは競合として保護します。

## 秘密値の無停止切替

管理者操作はPowerShellの安全入力スクリプトを使用します。秘密値をコマンドライン引数へ書きません。`Status`、`Rotate`、`Revoke`ではGASのスクリプトプロパティから`ADMIN_SECRET`をコピーして安全入力へ貼り付けます。入力直後にスクリプトがクリップボードを消去します。

```powershell
.\scripts\manage-gas-secrets.ps1 -Action GenerateAdmin
.\scripts\manage-gas-secrets.ps1 -Action Status -GasUrl "既存GAS WebアプリURL"
.\scripts\manage-gas-secrets.ps1 -Action Rotate -GasUrl "既存GAS WebアプリURL"
.\scripts\manage-gas-secrets.ps1 -Action Revoke -GasUrl "既存GAS WebアプリURL"
.\scripts\manage-gas-secrets.ps1 -Action ClearClipboard
```

1. `GenerateAdmin`で生成した値をGASの`ADMIN_SECRET`へだけ登録する。
2. GAS新版公開後、`Status`で`secrets_are_separated`相当の表示がTrueであることを確認する。
3. `Rotate`を実行する。スクリプトが新しい`API_SECRET`を生成し、`keep_previous: true`でローテーションして、成功後に新値をクリップボードへコピーする。
4. Cloudflare Pagesの`VITE_API_SECRET`へ貼り付け、新しいフロントを再ビルド・再デプロイする。
5. `ClearClipboard`を実行する。
6. 全端末が新しいGit短縮ハッシュへ更新されたことを確認する。
7. 複数端末同期と競合確認を完了する。
8. 24時間以内に`Revoke`を実行し、旧キーを失効させる。

README、Git、SSOT、PowerShell履歴へ秘密値の実値を記載しないでください。

## ローカル開発

```bash
npm ci
npm run dev
```

`.env.example`を`.env`へコピーし、必要な環境変数を設定します。`.env`はGitへ登録しません。

## 静的検証とビルド

```bash
npm run lint
npm run build
```

環境設定変更とデプロイへ進む前に、両方が終了コード0で完了することを必須とします。

## デプロイ

```bash
git add .
git commit -m "release: sync safety update"
git push origin main
```

Cloudflare Pagesの環境変数を変更した場合は、変数保存だけで完了扱いにせず、必ず新しいデプロイを実行します。

## ディレクトリ構成

```text
src/
├─ app/                  ルーティング、PWA、アプリ全体設定
├─ config/               AI等の設定値
├─ data/
│  ├─ local/             IndexedDB、同期キュー、競合保留
│  └─ remote/            GAS／AI HTTPクライアント
├─ features/             グラフ、設定画面
├─ security/             端末識別子
├─ services/
│  ├─ notifications/     通知関連
│  └─ sync/              同期イベント、調整、同期本体
├─ ui/                   共通部品、各画面、デザイントークン
└─ utils/                共通型とユーティリティ
scripts/
└─ manage-gas-secrets.ps1  管理者秘密値の生成・状態確認・ローテーション・失効
```

## ロールバック上の注意

`migrateSyncUpdatedAtToServerTimeOnce`実行後は、端末時刻を同期カーソルとして使用する旧同期方式へ戻さないでください。問題発生時も、新しいサーバー時刻・同期キュー・競合検出方式を維持したコード修正と再デプロイで復旧します。

時刻移行前のスプレッドシートバックアップを復元した場合は、入力停止中かつ新版再公開前にGASエディタから`remigrateSyncUpdatedAtAfterSpreadsheetRestore`を実行します。戻り値`status: remigrated`を確認してから全端末を全件同期します。通常運用中はこの関数を実行しません。
