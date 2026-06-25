export function LoadingGrid() {
  return (
    <div className="loading-block">
      {Array.from({ length: 24 }).map((_, card) => (
        <div className="skeleton-card" key={card} />
      ))}
    </div>
  );
}
