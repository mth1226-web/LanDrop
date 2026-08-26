// LanDrop内の項目をOSへドラッグ(startDrag)している最中に、同じウィンドウ内の
// アップロード用ドロップゾーンへ落としてしまい、コピーが作られてしまう問題を防ぐためのフラグ。
// startDrag中もHTML5のドラッグイベント自体は同じウィンドウ内で発火するため、
// アップロード処理側でこのフラグを見て無視する。
let internalDragActive = false

export function markInternalDragStart(): void {
  internalDragActive = true
}

export function markInternalDragEnd(): void {
  internalDragActive = false
}

export function isInternalDragActive(): boolean {
  return internalDragActive
}
