import { useSearchParams } from 'wouter';

const PARAM = 'explain';

/** The key whose explain modal is open on /settings, kept in `?explain=` so
    a reload or a shared link reopens it. */
export function useExplainParam() {
  const [params, setParams] = useSearchParams();
  // Opening pushes so Back closes the modal before it leaves the page.
  const write = (key: string | null) =>
    setParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (key) next.set(PARAM, key);
        else next.delete(PARAM);
        return next;
      },
      { replace: key === null }
    );
  return {
    key: params.get(PARAM),
    open: (key: string) => write(key),
    close: () => write(null),
  };
}

export function explainHref(key: string): string {
  return `/settings?${PARAM}=${encodeURIComponent(key)}`;
}
