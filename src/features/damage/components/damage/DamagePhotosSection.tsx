import { useState } from "react";
import { useDocuments } from "@/hooks/useDocuments";
import { DragDropImageUploader } from "@/components/DragDropImageUploader";
import { ImageGalleryLightbox } from "@/components/ImageGalleryLightbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera } from "lucide-react";

interface DamagePhotosSectionProps {
  entityType: string;
  entityId: string;
  title?: string;
  showUploader?: boolean;
}

export function DamagePhotosSection({ entityType, entityId, title = "Fotos de Daño", showUploader = true }: DamagePhotosSectionProps) {
  const { data: documents } = useDocuments(entityType, entityId);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const imageDocuments = documents?.filter((d) => d.mime_type?.startsWith("image/")) || [];
  const galleryImages = imageDocuments.map((d) => ({ url: d.file_url, name: d.file_name }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {imageDocuments.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {imageDocuments.map((doc, i) => (
              <button
                key={doc.id}
                onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                className="aspect-square rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer"
              >
                <img src={doc.file_url} alt={doc.file_name} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {showUploader && (
          <DragDropImageUploader entityType={entityType} entityId={entityId} />
        )}

        {!showUploader && imageDocuments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin fotos</p>
        )}

        <ImageGalleryLightbox
          images={galleryImages}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
        />
      </CardContent>
    </Card>
  );
}
