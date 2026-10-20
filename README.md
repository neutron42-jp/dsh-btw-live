# dsh-btw-live

DeepSeek Harness の `/btw`。**いま動いているターンも含めて**セッションに横から質問でき、答えは会話履歴にもモデルのコンテキストにも残りません。

## 特徴

- 実行中のターンのツールコールと結果も読む（`session.snapshotEvents()`）。フォーク型のサイド質問と違い、ターンを止めずに「いまの状態」を聞ける
- 1回きりの LLM 呼び出し。ツールは実行せず、履歴にも書き込まない
- モデルは**そのセッションが使っているもの**（未送信の選択 → 直前リクエストのヘッダ → 既定モデルの順）。セッションごとにモデルを変えても追随する
- 答えはトランスクリプト内の「BTW カード」で表示。Markdown、長い回答はカード内スクロール、ヘッダクリックで折りたたみ
- 回答待ちの間は「考えています…」、失敗は赤字。回答が届くと自動で開く
- セッションと同じモデル・同じ reasoning effort（指定が無ければアダプタ既定）で投げ、出力上限だけ絞る。プロバイダがその形を拒否したら、上限なしのセッションと同じ形で1回だけ再試行する

## 必要なもの

| | |
|---|---|
| DeepSeek Harness | 0.2.1-rc.2 で確認（`conversation.chat.commandview` スロットを使う） |
| Node.js | 22 以上 |

## インストール

```bash
cd "${DSH_HOME:-$HOME/.dsh}/profiles/web"
pnpm add link:/path/to/dsh-btw-live
```

`package.json` の `dsh.profile.bundles` に追加:

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@local/btw-live"
]
```

`dsh web` を再起動してページを再読み込み。クライアント側は起動時にしかスキャンされないので、初回は再起動が必要です（2回目以降の `client.js` 編集は HMR が拾います）。

## 使い方

```
/btw いまどこまで進んだ？
```

## 設定

`cordis.patch.yml` の `config`（既定値）:

| キー | 既定 | 意味 |
|---|---:|---|
| `maxEvents` | 80 | 読むイベント数（末尾から） |
| `maxChars` | 16000 | トランスクリプト文字数の上限 |
| `toolArgChars` | 300 | ツール引数の表示文字数 |
| `toolResultChars` | 900 | ツール結果の表示文字数 |
| `maxTokens` | 4096 | 回答の最大トークン |
| `timeoutMs` | 120000 | 1回の呼び出しのタイムアウト |

## 仕組み

- `index.js`（ホスト側）— `commands` に `btw` を登録する。セッションログからトランスクリプトを組み、`llm` で1回だけストリームする。答えは `command/done` の `text` として返る
- `client.js`（ブラウザ側）— `conversation.chat.commandview` の `btw` キーだけを差し替える。他のコマンドは汎用の行のまま。`locale` で ja / en / zh の辞書を持つ

## 失敗したとき

カードには試行ごとの結末が出ます（`finish` の `reason.kind` と `failure.code` / HTTP status / メッセージ）。

```
btw failed: no answer (#1 error PI_AI_ERROR HTTP 400 — …; #2 stop; provider=… model=…)
```

- `#1` が出力上限あり、`#2` が上限なし（セッション本体と同じ形）。2回目で成功すれば表示は成功のまま
- 再試行しないコード: 認証・クォータ・コンテキスト超過など、同じ形で投げ直しても同じ結果になるもの

## ライセンス

[MIT](<LICENSE>)
