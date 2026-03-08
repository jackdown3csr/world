import AppStateScreen from "@/components/AppStateScreen";

export default function NotFound() {
  return (
    <AppStateScreen
      eyebrow="page not found"
      title="Page Not Found"
      description="This page does not exist."
      tone="warning"
      primaryAction={{ label: "go home", href: "/" }}
    />
  );
}
