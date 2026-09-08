// React Compiler memoiza `visiblePages` y los callbacks de este componente.
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, onPageChange }: TablePaginationProps) {
  const computeVisiblePages = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };
  const visiblePages = computeVisiblePages();

  const goPrev = () => onPageChange(Math.max(1, page - 1));
  const goNext = () => onPageChange(Math.min(totalPages, page + 1));

  if (totalPages <= 1) return null;

  return (
    <Pagination className="py-4 sm:mx-0 sm:w-auto sm:justify-end">
      <PaginationContent className="flex-nowrap">
        <PaginationItem>
          <PaginationPrevious
            onClick={goPrev}
            disabled={page === 1}
          />
        </PaginationItem>
        {/* V26-01: en móvil la numeración completa desbordaba el ancho del
            contenedor. Se sustituye por un indicador compacto "N de M"
            (mismo estado, mismos handlers); desde `sm` vuelven los números. */}
        <PaginationItem className="sm:hidden">
          <span className="px-2 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
            {page} de {totalPages}
          </span>
        </PaginationItem>
        {visiblePages.map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`e-${i}`} className="hidden sm:block">
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p} className="hidden sm:block">
              <PaginationLink
                isActive={p === page}
                onClick={() => onPageChange(p)}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            onClick={goNext}
            disabled={page === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
