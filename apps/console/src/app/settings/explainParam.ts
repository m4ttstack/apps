import { useSearchParams } from 'wouter';

const PARAM = 'explain';

/** The key whose explain modal is open, kept in `?explain=` so a reload or
    a shared link reopens it over the same page. */
export function useExplainParam() {
  const [params, setParams] = useSearchParams();
  const write = (key: string | null) =>
    setParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (key) next.set(PARAM, key);
        else next.delete(PARAM);
        return next;
      },
      { replace: true }
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
