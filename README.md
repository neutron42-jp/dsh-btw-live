# dsh-btw-live

DeepSeek Harness の `/btw`。**いま動いているターンも含めて**セッションに横から質問でき、答えは会話履歴にもモデルのコンテキストにも残りません。

## 特徴

- 実行中のターンのツールコールと結果も読む（`session.snapshotEvents()`）。フォーク型のサイド質問と違い、ターンを止めずに「いまの状態」を聞ける
- 1回きりの LLM 呼び出し。ツールは実行せず、履歴にも書き込まない
- 答えはトランスクリプト内の「BTW カード」で表示。Markdown、長い回答はカード内スクロール、ヘッダクリックで折りたたみ
- 回答待ちの間は「考えています…」、失敗は赤字。回答が届くと自動で開く

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

## ライセンス

[MIT](<LICENSE>)
