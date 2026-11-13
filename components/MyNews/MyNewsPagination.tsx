"use client";

import React from "react";
import styles from "../MyAds/page.module.css";

interface MyNewsPaginationProps {
  currentPage: number;
  totalItems: number;
  perPage: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function MyNewsPagination({
  currentPage,
  totalItems,
  perPage,
  itemLabel,
  onPageChange,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: MyNewsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  if (totalItems <= perPage && !hasMore) return null;

  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("ellipsis-1");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("ellipsis-2");
    pages.push(totalPages);
  }

  return (
    <div className={styles.paginationBar}>
      <span className={styles.paginationInfo}>
        Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, totalItems)} of {totalItems}{" "}
        {itemLabel}
      </span>
      <div className={styles.paginationControls}>
        {totalPages > 1 && (
          <>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              Prev
            </button>
            {pages.map((pg, idx) =>
              typeof pg === "string" ? (
                <span key={`el-news-${idx}`} className={styles.paginationEllipsis}>
                  …
                </span>
              ) : (
                <button
                  key={`pg-news-${pg}`}
                  type="button"
                  className={`${styles.pageBtn} ${pg === currentPage ? styles.pageBtnActive : ""}`}
                  onClick={() => onPageChange(pg)}
                >
                  {pg}
                </button>
              )
            )}
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </>
        )}
        {hasMore && onLoadMore && (
          <button
            type="button"
            className={styles.pageBtn}
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        )}
      </div>
    </div>
  );
}
