"use client";

import AppStateScreen from "@/components/AppStateScreen";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <AppStateScreen
          eyebrow="app error"
          title="The App Hit A Problem"
          description="A larger app error stopped the page from loading. Try again or go back to the home page."
          detail={error.digest ? `Error ID: ${error.digest}` : undefined}
          tone="error"
          primaryAction={{ label: "try again", onClick: reset }}
          secondaryAction={{ label: "go home", href: "/" }}
        />
      </body>
    </html>
  );
}
