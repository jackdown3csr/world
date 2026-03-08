"use client";

import AppStateScreen from "@/components/AppStateScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppStateScreen
      eyebrow="something went wrong"
      title="This Page Could Not Load"
      description="Something broke while loading this view. Try again or go back to the main page."
      detail={error.digest ? `Error ID: ${error.digest}` : undefined}
      tone="error"
      primaryAction={{ label: "try again", onClick: reset }}
      secondaryAction={{ label: "go home", href: "/" }}
    />
  );
}
