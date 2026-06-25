import { useRef } from "react";

const LONG_PRESS_MS = 750;

export function RescanButton({ disabled, forceConfirmMessage = "确认强制刷新？这会忽略缓存并重新读取本地数据、请求外部 API。", onClick, onForceClick }) {
  const timerRef = useRef(null);
  const didLongPressRef = useRef(false);

  function clearLongPressTimer() {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function startLongPress() {
    if (disabled || !onForceClick) return;

    didLongPressRef.current = false;
    clearLongPressTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      didLongPressRef.current = true;
      if (window.confirm(forceConfirmMessage)) {
        onForceClick();
      }
    }, LONG_PRESS_MS);
  }

  function handleClick(event) {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      event.preventDefault();
      return;
    }

    onClick?.();
  }

  return (
    <button
      aria-label={disabled ? "扫描中" : "重新扫描，长按强制刷新"}
      className="icon-button"
      disabled={disabled}
      onClick={handleClick}
      onPointerCancel={clearLongPressTimer}
      onPointerDown={startLongPress}
      onPointerLeave={clearLongPressTimer}
      onPointerUp={clearLongPressTimer}
      title={disabled ? "扫描中" : "重新扫描，长按强制刷新"}
      type="button"
    >
      <svg aria-hidden="true" className={disabled ? "icon-button-svg icon-button-svg--spin" : "icon-button-svg"} viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 0 1-15.3 6.36" />
        <path d="M3 12A9 9 0 0 1 18.3 5.64" />
        <path d="M18 2v4h4" />
        <path d="M6 22v-4H2" />
      </svg>
    </button>
  );
}
