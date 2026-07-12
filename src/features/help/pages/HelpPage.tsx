import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/features/users";
import { HelpPageHeader } from "../components/HelpPageHeader";
import { ManualSections } from "../components/ManualSections";
import { ManualEmptyCard, ManualGeneratingCard } from "../components/ManualStateCards";
import { useUserManual } from "../hooks/useUserManual";

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
      <PageContainer maxWidth="wide">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
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
    </PageContainer>
  );
}
