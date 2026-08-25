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
electron-builderを使わずに「ビルド済みファイル一式 + Electron本体」をそのままコピーして動かす方式を使っている。

手順（このリポジトリのルートで実行）:
```powershell
npm run build

# ビルド済みファイル(out/)とpackage.json、Electron本体をひとつのフォルダにまとめる
mkdir dist-portable\LanDrop-Windows\node_modules
copy package.json dist-portable\LanDrop-Windows\
xcopy /E /I out dist-portable\LanDrop-Windows\out
xcopy /E /I node_modules\electron dist-portable\LanDrop-Windows\node_modules\electron

# dist-portable\LanDrop-Windows\起動.bat を作成(内容は1行: electron.exeを%~dp0付きで起動)
# フォルダごとzip化して他のPCにコピーし、「起動.bat」をダブルクリックすれば動く
Compress-Archive -Path dist-portable\LanDrop-Windows -DestinationPath LanDrop-Windows.zip
```

配布先のPCでは、zipを展開して`起動.bat`をダブルクリックするだけで起動する（インストール不要、npm/Node.js不要）。
ソースを変更した場合はこの手順をやり直して新しいzipを作り直す必要がある(自動更新の仕組みは無い)。

もしWindowsの開発者モードが有効にできる環境なら、上記の代わりに`npm run package`（electron-builder）で
ちゃんとしたポータブルexe/インストーラーを作れる（`package.json`の`build.win.target`は`portable`に設定済み）。

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
