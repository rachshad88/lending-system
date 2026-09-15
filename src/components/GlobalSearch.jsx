import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './ui';
import { useDebounced } from '../lib/useAsync';
import { searchMembers } from '../lib/api';

/** Jump to any member by name, TODA, contact number or vehicle number from anywhere in the app. */
export default function GlobalSearch({ className = '', onNavigate }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const debounced = useDebounced(term);

  useEffect(() => {
    const query = debounced.trim();
    if (!query) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    searchMembers(query)
      .then((rows) => {
        if (active) setResults(rows);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debounced]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const go = (member) => {
    setTerm('');
    setResults([]);
    setOpen(false);
    onNavigate?.();
    navigate(`/app/members/${member.id}`);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
        <Icon name="search" size={16} />
      </span>
      <input
        className="input h-9 pl-9 text-sm"
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search members…"
        aria-label="Search members"
      />
      {open && term.trim() && (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1.5 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">No match.</p>
          ) : (
            results.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => go(member)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#f2f4f9]"
              >
                <span className="truncate font-semibold">{member.name}</span>
                {member.toda && <span className="shrink-0 text-xs text-faint">{member.toda}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
