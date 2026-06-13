import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserManual } from "@/features/help/hooks/useUserManual";
import { useUserRole } from "@/features/users";
import { HelpPageHeader } from "../components/HelpPageHeader";
import { ManualEmptyCard, ManualGeneratingCard } from "../components/ManualStateCards";
import { ManualSections } from "../components/ManualSections";

export default function HelpPage() {
  const { manual, isLoading, generate, isGenerating, versions, selectedVersion, setSelectedVersion } = useUserManual();
  const { data: role } = useUserRole();
  const [search, setSearch] = useState("");
  const isAdmin = role === "admin";

  const filteredSections = manual?.content?.filter((s) =>
    search === "" ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.content.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <HelpPageHeader
        manualVersion={manual?.version}
        generatedAt={manual?.generated_at}
        versions={versions}
        selectedVersion={selectedVersion}
        onSelectVersion={setSelectedVersion}
        isAdmin={isAdmin}
        isGenerating={isGenerating}
        hasManual={!!manual}
        onGenerate={() => generate()}
      />

      {isGenerating && <ManualGeneratingCard />}
      {!manual && !isGenerating && <ManualEmptyCard isAdmin={isAdmin} onGenerate={() => generate()} />}
      {manual && !isGenerating && (
        <ManualSections search={search} onSearchChange={setSearch} sections={filteredSections} />
      )}
    </div>
  );
}
