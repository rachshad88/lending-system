import { useState } from 'react';
import { AuditTrail } from '../components/AuditTrail';
import { ErrorNote, SectionCard, SkeletonRows } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { listRecentAudit } from '../lib/api';

const PAGE_SIZE = 100;

export default function AuditLog() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, error, loading, reload } = useAsync(() => listRecentAudit(limit), [limit]);
  const rows = (data ?? []).map((entry) => ({ ...entry, kind: entry.source }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Audit log</h1>
        <p className="text-muted">
          Every correction to a loan or a payment, across every member, newest first.
        </p>
      </header>

      <ErrorNote error={error} onRetry={reload} />

      <SectionCard bodyClass={loading ? 'p-4' : undefined}>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : (
          <AuditTrail
            rows={rows}
            emptyHint="No loan or payment has been corrected yet. Edits and deletions across every member will show up here."
          />
        )}
      </SectionCard>

      {!loading && !error && rows.length >= limit && (
        <button type="button" className="btn btn-outline" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
          Load more
        </button>
      )}
    </div>
  );
}
