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

echo "=== 1/5: Node.jsを確認しています... ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && { \. "$NVM_DIR/nvm.sh" || true; }
command -v nvm >/dev/null 2>&1 && { nvm use default >/dev/null 2>&1 || true; }

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.jsが無いので、自動でインストールします（初回のみ、数分かかります）。"
  echo "パスワードの入力は不要です。しばらくお待ちください..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash || true
  [ -s "$NVM_DIR/nvm.sh" ] && { \. "$NVM_DIR/nvm.sh" || true; }
  command -v nvm >/dev/null 2>&1 && { nvm install --lts || true; }
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo ""
  echo "Node.jsの自動インストールに失敗しました。"
  echo "お手数ですが https://nodejs.org/ からLTS版を手動でインストールしてから、"
  echo "もう一度このファイルをダブルクリックしてください。"
  read -p "Enterキーを押すと終了します..." _
  exit 1
fi
echo "Node.js $(node -v) / npm $(npm -v) を使用します。"

# scripts/ の1つ上にpackage.jsonがあれば、そこが本体（git clone / ZIP解凍のどちらでもOK）。
# 無ければこのファイルの隣にLanDropフォルダを新規取得する（要git）。
if [ -f "../package.json" ]; then
  cd ..
  if [ -d ".git" ]; then
    echo "--- 最新版に更新しています ---"
    git pull --ff-only || echo "（更新をスキップしました。ローカルの変更がある可能性があります）"
  fi
else
  if ! command -v git >/dev/null 2>&1; then
    echo "gitが見つかりません。"
    echo "このスクリプトを初めて実行すると、macOSが「コマンドラインデベロッパツール」の"
    echo "インストールを提案するダイアログを出すことがあります。その場合は指示に従って"
    echo "インストールしてから、もう一度このファイルをダブルクリックしてください。"
    read -p "Enterキーを押すと終了します..." _
    exit 1
  fi
  if [ ! -d "LanDrop" ]; then
    echo "--- LanDropを取得しています ---"
    git clone "$REPO_URL"
  fi
  cd LanDrop
fi

echo ""
echo "=== 2/5: 依存パッケージをインストール中... ==="
npm install

echo ""
echo "=== 3/5: アプリをビルド中... ==="
npm run package

APP_PATH=$(find dist -maxdepth 2 -name "LanDrop.app" 2>/dev/null | head -n 1)
if [ -z "$APP_PATH" ]; then
  echo ""
  echo "ビルドに失敗しました（LanDrop.appが見つかりません）。上のログを確認してください。"
  read -p "Enterキーを押すと終了します..." _
  exit 1
fi

echo ""
echo "=== 4/5: 署名しています（Gatekeeper対策） ==="
codesign --force --deep --sign - "$APP_PATH"

echo ""
echo "=== 5/5: 完了しました。Finderで表示します ==="
open -R "$APP_PATH"

echo ""
echo "「$APP_PATH」ができました。"
echo "初回起動時は、Finderで LanDrop.app を右クリック（またはControl+クリック）して"
echo "「開く」を選んでください（Gatekeeperの警告を承知の上で起動できます）。"
echo ""
read -p "Enterキーを押すとこのウィンドウを閉じます..." _
