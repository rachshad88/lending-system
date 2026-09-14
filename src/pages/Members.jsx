import { useState } from 'react';
import { Link } from 'react-router-dom';
import MemberForm from '../components/MemberForm';
import Pagination from '../components/Pagination';
import { EmptyState, ErrorNote, Icon, SectionCard, SkeletonRows } from '../components/ui';
import { useAsync, useDebounced } from '../lib/useAsync';
import { createMember, getMemberReliabilityBulk, getSettingsCached, listMembers } from '../lib/api';
import { formatDate, initials } from '../lib/format';
import { GRADE_LABELS, GRADE_PILLS, reliabilityGrade } from '../lib/risk';

const PAGE_SIZE = 20;

function Avatar({ name }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand">
      {initials(name)}
    </span>
  );
}

function ReliabilityBadge({ grade }) {
  if (!grade) return null;
  return <span className={`pill ${GRADE_PILLS[grade]}`}>{GRADE_LABELS[grade]}</span>;
}

export default function Members() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounced(search);

  const { data, error, loading, reload } = useAsync(
    () => listMembers({ search: debouncedSearch, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, page]
  );

  const rows = data?.rows ?? [];
  const rowIds = rows.map((m) => m.id);

  const settings = useAsync(getSettingsCached, []);
  const goneQuietDays = Number(settings.data?.gone_quiet_days) || 3;

  // One extra round trip for the whole page instead of one per row.
  const reliability = useAsync(
    () => getMemberReliabilityBulk(rowIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowIds.join(',')]
  );
  const gradeFor = (memberId) => {
    const facts = reliability.data?.get(memberId);
    return reliabilityGrade(facts ?? { loans_completed: 0 }, { goneQuietDays })?.grade;
  };

  const onSearch = (event) => {
    setSearch(event.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Members</h1>
          <p className="text-muted">Everyone on the books, newest first.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} />
          New member
        </button>
      </header>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
          <Icon name="search" size={18} />
        </span>
        <input
          className="input pl-11"
          type="search"
          value={search}
          onChange={onSearch}
          placeholder="Search by name, number, vehicle or TODA"
          aria-label="Search members"
        />
      </div>

      <ErrorNote error={error} onRetry={reload} />

      <SectionCard bodyClass="">
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'No members match that search' : 'No members yet'}
            hint={
              debouncedSearch
                ? 'Try a shorter search term, or a contact number.'
                : 'Add your first member to start recording loans.'
            }
            action={
              !debouncedSearch && (
                <button
                  type="button"
                  className="btn btn-primary mt-2"
                  onClick={() => setCreating(true)}
                >
                  <Icon name="plus" size={18} />
                  New member
                </button>
              )
            }
          />
        ) : (
          <>
            {/* Phone: tappable list */}
            <ul className="divide-y divide-[#eef0f6] sm:hidden">
              {rows.map((member) => (
                <li key={member.id}>
                  <Link
                    to={`/app/members/${member.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 active:bg-[#f8fafd]"
                  >
                    <Avatar name={member.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-bold">{member.name}</span>
                        {reliability.loading ? (
                          <span className="skeleton inline-block h-4 w-16 align-middle" />
                        ) : (
                          <ReliabilityBadge grade={gradeFor(member.id)} />
                        )}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {[member.toda, member.contact_number].filter(Boolean).join(' · ') ||
                          'No contact details'}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop: full table */}
            <div className="table-wrap hidden sm:block">
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Track record</th>
                    <th>Contact</th>
                    <th>TODA</th>
                    <th>Vehicle</th>
                    <th>Joined</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((member) => (
                    <tr key={member.id} className="clickable">
                      <td>
                        <Link
                          to={`/app/members/${member.id}`}
                          className="flex items-center gap-3 font-bold"
                        >
                          <Avatar name={member.name} />
                          {member.name}
                        </Link>
                      </td>
                      <td>
                        {reliability.loading ? (
                          <span className="skeleton inline-block h-5 w-20 align-middle" />
                        ) : (
                          <ReliabilityBadge grade={gradeFor(member.id)} />
                        )}
                      </td>
                      <td className="tnum text-muted">{member.contact_number ?? '—'}</td>
                      <td className="text-muted">{member.toda ?? '—'}</td>
                      <td className="tnum text-muted">{member.vehicle_number ?? '—'}</td>
                      <td className="text-muted">{formatDate(member.created_at)}</td>
                      <td className="num">
                        <Link
                          to={`/app/members/${member.id}`}
                          className="btn btn-sm btn-ghost"
                          aria-label={`Open ${member.name}`}
                        >
                          <Icon name="chevronRight" size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data?.total ?? 0}
              onChange={setPage}
              unit="members"
            />
          </>
        )}
      </SectionCard>

      {creating && (
        <MemberForm
          open
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await createMember(values);
            reload();
          }}
        />
      )}
    </div>
  );
}
