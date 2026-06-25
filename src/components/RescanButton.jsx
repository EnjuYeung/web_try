export function RescanButton({ disabled, onClick }) {
  return (
    <button
      aria-label={disabled ? "扫描中" : "重新扫描"}
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "扫描中" : "重新扫描"}
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
