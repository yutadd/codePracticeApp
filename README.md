# コード練習ゲーム

ダイアトニックコードをディグリーで弾けるようになるための練習用Webアプリ。仕様は [コード練習ゲーム 仕様書.md](コード練習ゲーム%20仕様書.md)。

## 起動

Node.js 22.13 以上が必要です（進捗の保存に組み込みの `node:sqlite` を使うため）。

```sh
npm install
npm start               # バックグラウンドで起動してブラウザを開く（https://localhost:5173）
npm stop                # 終了
npm run reset-progress  # 進捗（解放状況・統計・ハイスコア）をリセット。設定と遅延補正値は残す
npm run clear-all       # すべてのテーマ・キー・段階をクリア済みにする
npm run dev             # フォアグラウンドで起動（Ctrl+C で終了）
npm test                # 判定ロジックのテスト
npm run build           # dist/ に出力
npm run build:static    # 静的配信版を dist-static/ に出力（下記）
```

Windows ではルートの `start.bat` `stop.bat` `reset-progress.bat` `clear-all.bat` をダブルクリックしても同じです。`npm start` のログは `.run/app.log` に出ます。

- Web MIDI は「localhost」か「https」でしか使えないため、開発サーバーは自己署名証明書の https で起動します（`@vitejs/plugin-basic-ssl`）。スマホ（Android Chrome）からは `https://<PCのIPアドレス>:5173/` を開き、初回の「この接続ではプライバシーが保護されません」で「詳細設定」→「アクセスする」を選んでください。PCのブラウザでも同じ警告が出ます。
- MIDI機器がなくても、設定の「PCキーボードで入力」をONにすると①をテストできます（A〜; が白鍵、W E T Y U O P が黒鍵、Z/X でオクターブ）。
- 設定の「すべてのテーマ・キーを解放する」で、解放条件を無視して遊べます。

## 構成

| ファイル | 内容 |
| --- | --- |
| `src/music/theory.ts` | キー・ディグリー・コード、必須音／省略可／テンションの定義 |
| `src/music/themes.ts` | 6テーマ、キーの解放順、進行、伴奏の種類、解放条件 |
| `src/music/flashScoring.ts` | ①の判定（区間の振り分け、経過音、ヴォイスリーディング、採点、ランク） |
| `src/audio/` | Tone.js による発音（ピアノ、メトロノーム、ドラム、ベース）とスケジューラ |
| `src/midi/midi.ts` | Web MIDI 入力、PCキーボード入力 |
| `src/store/progress.ts` | 進捗・統計・設定・遅延補正値の保存、苦手コードの重み付け、端末間マージ |
| `src/store/server.ts` | 起動中のサーバーの SQLite への保存と、スクリプト・他端末の変更の取り込み |
| `src/store/sync.ts` | Supabase による Googleログインと同期 |
| `server/progressDb.mjs` | SQLite（`data/progress.db`）の読み書きと `/api/progress`（Vite プラグイン） |
| `scripts/` | 起動・終了・リセット・全クリのスクリプト |
| `src/music/scale.ts` | ④スケール練習のお題と判定 |
| `src/music/jam.ts` | ⑤フリー演奏のコード（ディグリー＋種類）、ヴォイシング、YouTube URL の解析 |
| `src/components/YouTubePlayer.tsx` | YouTube の埋め込み（IFrame Player API） |
| `src/screens/` | 各画面（ホーム、①フラッシュ、③パズル、④スケール練習、⑤フリー演奏、遅延補正、設定、記録） |

## 進捗の保存

進捗は `npm start` / `npm run dev` / `npm run preview` で起動したサーバーの SQLite（`data/progress.db`、環境変数 `PROGRESS_DB` で変更可）に保存されます。同じサーバーにつないだ端末（PCとLAN内のスマホなど）は同じ進捗を共有します。

- 中身は1行の JSON（`progress` テーブル）です。`revision` は書き込みごとに増え、端末間で書き込みがぶつかったときはマージします。
- リセット・全クリのスクリプトは `epoch` を増やします。起動中のアプリは、画面に戻ったとき（または再読み込みで）その内容をそのまま取り込みます。設定画面の「進捗をリセット」も同じ扱いです。
- サーバーがない配信（Vercel などの静的ホスティング）では、従来どおりブラウザの localStorage にだけ保存します。初めてサーバーにつないだとき、サーバーが空なら localStorage の進捗を SQLite に移します。

## 進捗の同期（任意）

`.env.local` に Supabase の URL と anon key を書くと、設定画面に「Googleでログイン」が出ます。

```sh
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Supabase 側の準備：

1. Authentication → Providers で Google を有効にし、Redirect URL にアプリのURLを追加する
2. SQL Editor で次を実行する

```sql
create table progress (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table progress enable row level security;
create policy "own progress" on progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 静的配信版（AWS）

サーバーも同期も使わず、進捗をブラウザの localStorage にだけ保存する版です。外出先のスマホで遊ぶ用。

```sh
npm run build:static   # dist-static/ に出力
npm run deploy:aws     # ビルドして S3 + CloudFront に配信し、URL を表示
```

- `deploy:aws` には [AWS CLI](https://aws.amazon.com/cli/) と認証情報（`aws configure`）が必要です。初回は `aws/static-site.yaml` の CloudFormation スタック（非公開の S3 バケットと CloudFront）を作ります。スタック名は環境変数 `STACK_NAME` で変更できます（既定は `code-practice-app`）。
- https は CloudFront の既定ドメイン（`https://xxxx.cloudfront.net/`）のものを使うので、Web MIDI も証明書の警告なしで使えます。
- 進捗は端末（ブラウザ）ごとで、PC版の SQLite とは共有しません。
- 片付けるときは S3 バケットを空にしてから `aws cloudformation delete-stack --stack-name code-practice-app` を実行します。

## 静的配信版（GitHub Pages）

`main` に push すると、GitHub Actions（`.github/workflows/pages.yml`）がテスト・ビルドして `https://<ユーザー>.github.io/<リポジトリ>/` に公開します。Actions タブの「GitHub Pages」から手動でも実行できます。

- 初回だけ、リポジトリの **Settings → Pages → Build and deployment → Source** を「**GitHub Actions**」にしてください。
- サブパスで配信するため、ビルド時に `BASE_PATH=/<リポジトリ名>/` を渡しています（ワークフローで自動）。
- https で配信されるので、⑤フリー演奏の YouTube 埋め込みや Web MIDI も使えます。進捗は AWS 版と同じくブラウザごとです。

## 仕様書から補った解釈

遊びながら調整する前提で、仕様書に書かれていない部分は次のように決めています。

- **共通音の扱い（①）**：小節頭の前後1拍で弾いた「両方のコードに合う音」は、仕様どおり前の小節に数えたうえで、次のコードの必須音としても数える（Dm7→G7 の F のような共通音を押さえ直さなくてよいように）。ただし、次の小節頭より後に弾いた共通音は前のコードのボーナスには数えない。
- **ヴォイシング（①）**：小節の前半に弾いた構成音・テンションを「その小節の押さえ方」とみなし、ヴォイスリーディング・ベース根音・転回形の判定に使う。
- **転回形ボーナス**：同じセッション内で、そのコードを前回弾いたときと押さえ方（下からの構成音の並び）が違えば +5。
- **ランクの満点**：基本点（100×小節数）。ボーナスがあるので100%を超えることがある。
- **3和音にダイアトニックの7度を足す**：4和音レベル以上のテーマ（J-POP の Ⅵm など）では減点しない（ボーナスもなし）。
- **正解率とクリア**：①は正解した小節の割合、③はミスなしで正解した問題の割合。8問（小節）以上のセッションで90%以上ならクリア。
- **基礎テーマの段階**：各キーで 3和音 → 4和音 → ルートレス。4和音のクリアで次のキーの3和音が解放される。
- **EDM のキー**：Am・Fm… と表示し、ディグリーは平行長調（C・A♭…）で数える。
- **逆引きの選択肢**：テーマのコードを優先し、足りないとき（リラックスなど）はダイアトニックコードで補う。
