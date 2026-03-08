import AppStateScreen from "@/components/AppStateScreen";

export default function Loading() {
  return (
    <AppStateScreen
      eyebrow="loading"
      title="Loading"
      description="Getting the scene ready."
      tone="info"
      busy
    />
  );
}
