#!/bin/bash
# LanDropをMac用にビルドして起動できる状態にするための自動スクリプト。
# Finderでダブルクリックするだけで、依存インストール→ビルド→署名→Finder表示まで自動で行う。
set -e
cd "$(dirname "$0")"

REPO_URL="https://github.com/mth1226-web/LanDrop.git"

echo "=================================================="
echo " LanDrop Mac用ビルドスクリプト"
echo "=================================================="
echo ""

if command -v git >/dev/null 2>&1; then
  :
else
  echo "gitが見つかりません。"
  echo "このスクリプトを初めて実行すると、macOSが「コマンドラインデベロッパツール」の"
  echo "インストールを提案するダイアログを出すことがあります。その場合は指示に従って"
  echo "インストールしてから、もう一度このファイルをダブルクリックしてください。"
  read -p "Enterキーを押すと終了します..." _
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.jsがインストールされていません。"
  echo "https://nodejs.org/ からLTS版をインストールしてから、もう一度このファイルを"
  echo "ダブルクリックしてください。"
  read -p "Enterキーを押すと終了します..." _
  exit 1
fi

# scripts/ の1つ上がリポジトリ本体ならそこへ、そうでなければこのファイルの隣に
# LanDropフォルダを新規取得（or 更新）してそちらを使う。
if [ -f "../package.json" ] && [ -d "../.git" ]; then
  cd ..
else
  if [ ! -d "LanDrop" ]; then
    echo "--- LanDropを取得しています ---"
    git clone "$REPO_URL"
  fi
  cd LanDrop
fi

echo "--- 最新版に更新しています ---"
git pull --ff-only || echo "（更新をスキップしました。ローカルの変更がある可能性があります）"

echo ""
echo "=== 1/4: 依存パッケージをインストール中... ==="
npm install

echo ""
echo "=== 2/4: アプリをビルド中... ==="
npm run package

APP_PATH=$(find dist -maxdepth 2 -name "LanDrop.app" 2>/dev/null | head -n 1)
if [ -z "$APP_PATH" ]; then
  echo ""
  echo "ビルドに失敗しました（LanDrop.appが見つかりません）。上のログを確認してください。"
  read -p "Enterキーを押すと終了します..." _
  exit 1
fi

echo ""
echo "=== 3/4: 署名しています（Gatekeeper対策） ==="
codesign --force --deep --sign - "$APP_PATH"

echo ""
echo "=== 4/4: 完了しました。Finderで表示します ==="
open -R "$APP_PATH"

echo ""
echo "「$APP_PATH」ができました。"
echo "初回起動時は、Finderで LanDrop.app を右クリック（またはControl+クリック）して"
echo "「開く」を選んでください（Gatekeeperの警告を承知の上で起動できます）。"
echo ""
read -p "Enterキーを押すとこのウィンドウを閉じます..." _
