// Nov 8 (Jade): "Show my QR" opens a pop-up instead of a whole page.
// Any button can call openMyQr(); Layout.jsx shows the pop-up (QrSheet.jsx).
export function openMyQr() {
  window.dispatchEvent(new Event('vwb:my-qr'))
}
