interface ConfigurationErrorScreenProps {
  errors: string[];
}

/** Visible fallback for an incomplete deployment instead of an empty page. */
export function ConfigurationErrorScreen({ errors }: ConfigurationErrorScreenProps) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center text-foreground"
      role="alert"
      data-testid="configuration-error"
    >
      <div className="text-5xl" aria-hidden="true">👑</div>
      <h1 className="mt-5 text-2xl font-bold">CrownMe is temporarily unavailable</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The app could not start because its service configuration is incomplete.
        Please try again shortly or contact CrownMe support if the problem continues.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Try again
      </button>
      {import.meta.env.DEV && (
        <details className="mt-6 max-w-xl text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Developer details</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </details>
      )}
    </main>
  );
}
