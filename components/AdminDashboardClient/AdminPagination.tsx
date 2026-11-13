"use client";

import React from "react";
import styles from "./page.module.css";

interface AdminPaginationProps {
  currentPage: number;
  setCurrentPage: (p: number) => void;
  totalCount: number;
  limit?: number;
  setLimit?: (l: number) => void;
}

export function AdminPagination({
  currentPage,
  setCurrentPage,
  totalCount,
  limit = 10,
  setLimit,
}: AdminPaginationProps) {
  const totalPages = Math.ceil(totalCount / limit);
  if (totalCount === 0) return null;

  const fromItem = totalCount > 0 ? currentPage * limit + 1 : 0;
  const toItem = Math.min((currentPage + 1) * limit, totalCount);

  const pages: number[] = [];
  const maxVisible = 5;
  let startPage = Math.max(0, currentPage - 2);
  const endPage = Math.min(totalPages - 1, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(0, endPage - maxVisible + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className={styles.paginationContainer}>
      <div className={styles.paginationLeft}>
        <span className={styles.paginationInfo}>
          Showing <strong>{fromItem}–{toItem}</strong> of <strong>{totalCount}</strong>
        </span>
        {setLimit && (
          <div className={styles.pageSizeSelector}>
            <span>Per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setCurrentPage(0);
              }}
              className={styles.selectLimit}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationGroup}>
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className={`${styles.btnAction} ${styles.paginationBtn}`}
          >
            Prev
          </button>

          {startPage > 0 && (
            <>
              <button onClick={() => setCurrentPage(0)} className={`${styles.btnAction} ${styles.paginationNumBtn}`}>
                1
              </button>
              {startPage > 1 && <span className={styles.paginationEllipsis}>…</span>}
            </>
          )}

          {pages.map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              className={`${styles.btnAction} ${styles.paginationNumBtn} ${p === currentPage ? styles.paginationNumActive : ""}`}
            >
              {p + 1}
            </button>
          ))}

          {endPage < totalPages - 1 && (
            <>
              {endPage < totalPages - 2 && <span className={styles.paginationEllipsis}>…</span>}
              <button onClick={() => setCurrentPage(totalPages - 1)} className={`${styles.btnAction} ${styles.paginationNumBtn}`}>
                {totalPages}
              </button>
            </>
          )}

          <button
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            className={`${styles.btnAction} ${styles.paginationBtn}`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
