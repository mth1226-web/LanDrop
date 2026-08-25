# LanDrop

同じWi-Fi/LANに繋がったWindows/Mac同士で、事前の共有設定なしにお互いを自動発見し、ドラッグ&ドロップだけでファイルを送受信できるデスクトップアプリです。

## 使い方

1. 各PCでLanDropを起動する（同じWi-Fi/LANに接続していること）。設定画面で「共有フォルダ」を確認・追加・削除できる（複数設定可能。デフォルトはドキュメント内の「LanDrop共有」フォルダ1つ）。設定画面のドロップゾーンにフォルダをドラッグ&ドロップするか、「フォルダを選んで追加」ボタンで追加できる
2. しばらくすると左のPC一覧に他の端末が表示される。一番上には自分自身も「（自分）」として表示される
3. PCを選ぶと、そのPCの共有フォルダの一覧（複数ある場合はフォルダアイコンが並ぶ）が右側に表示される。フォルダはクリックで移動でき、上部のパンくずで階層を戻れる
4. 共有フォルダの中に入った状態で、「アップロード」ボタンまたはファイルのドラッグ&ドロップにより、選んでいるPCの共有フォルダにファイルを送り込める（自分のPCを選んでいる場合はローカルにコピーされる）
5. ファイルの「ダウンロード」ボタンで、選んでいるPCの共有フォルダから自分の「ダウンロード保存先」（設定で変更可、デフォルトはダウンロードフォルダ）に取得できる
6. 共有フォルダの中で「新しいフォルダ」でサブフォルダ作成、「名前変更」でファイル/フォルダのリネームができる（共有フォルダ一覧の階層自体は設定画面で追加/削除する）

共有フォルダは承諾なしで誰でも読み書きできるため（家庭内LAN等、信頼できるネットワークでの利用を想定）、公衆Wi-Fiなど不特定多数が同じネットワークに繋がる環境では使わないでください。

初回起動時にWindowsファイアウォール／macOSのローカルネットワークアクセス許可のダイアログが出た場合は許可してください（同じネットワーク上の端末を見つけるために必要です）。

## 開発

```bash
npm install
npm run dev        # 開発モードで起動
npm run typecheck  # 型チェック
npm run test       # ユニットテスト（node --test、実ソケット/実HTTPサーバーでプロトコルを検証）
npm run build      # ビルド
npm run package    # electron-builderでの配布用パッケージ作成（要Windows開発者モード。下記参照）
```

## 他のPCへの配布（Windows）

この開発環境では`electron-builder`が内部で使う`winCodeSign`パッケージの展開にシンボリックリンク作成権限が必要で、
一般ユーザー権限のままだと失敗する（Windowsの「開発者モード」を有効にするか管理者権限が必要）。そのため、
electron-builderを使わずに、Electron本体の`electron.exe`を`LanDrop.exe`にリネームし、ビルド済みアプリを
`resources/app`配下に配置する(Electron自体の標準規約: `resources/app`があればそれを自動的にロードする)方式で、
本物の単体exeとして動く配布物を作っている。

手順（このリポジトリのルートで実行、PowerShell）:
```powershell
npm run build

$dest = "dist-portable\LanDrop-Windows"
Remove-Item dist-portable -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$dest\resources\app" | Out-Null
Copy-Item node_modules\electron\dist\* $dest -Recurse
Rename-Item "$dest\electron.exe" "LanDrop.exe"
Copy-Item package.json "$dest\resources\app\"
Copy-Item out "$dest\resources\app\out" -Recurse

Compress-Archive -Path $dest -DestinationPath dist-portable\LanDrop-Windows.zip
```

配布先のPCでは、zipを展開して`LanDrop.exe`をダブルクリックするだけで起動する（インストール不要、npm/Node.js不要）。

## アップデート機能（Windows）

ヘッダーの「アップデート」ボタン（またはメニューの ヘルプ→アップデートを確認）から、GitHub Releases
(`https://github.com/mth1226-web/LanDrop/releases/latest`)の最新版をワンクリックでダウンロード・展開・
入れ替え・再起動できる。仕組みは`src/main/updater.ts`:

1. GitHub Releases APIで最新タグ・アセット(`LanDrop-Windows.zip`)情報を取得し、`package.json`の`version`と比較
2. 新しければzipをダウンロードし、`extract-zip`で一時フォルダに展開
3. 実行中の`LanDrop.exe`が終了するのを待ってから、展開した新しいファイル一式を`robocopy`で現在のインストール
   フォルダ(実行中のexeがあるフォルダ)に上書きし、新しいexeを起動する`.bat`をバックグラウンドで起動してから
   アプリ自身は終了する

新しいバージョンを配布するときは、上記の配布手順でzipを作り直し、`package.json`の`version`を上げてから
`gh release create v<version> dist-portable\LanDrop-Windows.zip --title ... --notes ...`でGitHub Releaseを
作成する（zipのアセット名は必ず`LanDrop-Windows.zip`にすること。updaterがこの名前で検索している）。

この自動更新は現時点でWindows版のみ対応。Mac版は下記の手順で手動ビルドする。

## 仕組み

- **端末発見**: 固定UDPポート(48737)へブロードキャストする自前のannounce/goodbyeメッセージのみで実現（mDNS/Bonjour等の追加依存なし）。ゲストWi-Fi等でクライアント分離（AP isolation）が有効なネットワークでは動作しません。
- **共有フォルダの参照・操作**: 各インスタンスがローカルにHTTPサーバーを立て、共有フォルダ配下に対する一覧取得・アップロード・ダウンロード・フォルダ作成・リネームのAPIを提供する。すべての操作は共有フォルダのルートより外に出られないようパス検証している（パストラバーサル対策）。承諾ダイアログ等は無く、共有フォルダとして設定した時点で同じLAN上の他PCから読み書き可能になる。

## 他のPCへの配布（Mac）

Windows上のこの環境にはmacOS版のElectronバイナリが無く、Mac向けビルドはWindowsからは作れない。
**Mac実機を用意し、そのMac上で**このリポジトリを`git clone`してから以下を実行する。

```bash
npm install
npm run package
# dist/mac/LanDrop.app ができる（package.jsonのbuild.mac.targetでdir+zipを指定済み）

# 署名なしのアプリはmacOSのGatekeeperに弾かれるため、ad-hoc署名を行う
codesign --force --deep --sign - dist/mac/LanDrop.app
```

`dist/mac/LanDrop.app`を他のMacにコピー(またはdist/mac-arm64/zipで固めたものを配布)すれば、
初回起動時は右クリック→「開く」でGatekeeperの警告を回避して起動できる。

macOS 15 (Sequoia)以降は、アプリがLAN上の他端末にアクセスする際に「ローカルネットワークへのアクセス」許可ダイアログが表示される。このダイアログは**未署名の`electron-vite dev`実行では安定して発火しないことがある**ため、上記のad-hoc署名を経たビルドで確認すること（Apple Developer登録や公証は個人利用の範囲では不要）。
