export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}

export function FullScreenSpinner() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background">
      <Spinner />
    </div>
  );
}
