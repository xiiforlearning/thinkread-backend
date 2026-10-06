import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReportType, WordPriority, WordsQuery, WordStatus } from '../api/types';
import { backButton } from '../telegram/webapp';
import { useApi } from './session';

export const keys = {
  profile: ['me'] as const,
  progress: ['me', 'progress'] as const,
  calendar: (weeks: number) => ['me', 'calendar', weeks] as const,
  recommendations: ['me', 'recommendations'] as const,
  spotCheck: ['me', 'spot-check'] as const,
  words: (q: WordsQuery) => ['words', q] as const,
  word: (id: string) => ['words', 'one', id] as const,
  summary: ['words', 'summary'] as const,
  reports: ['reports'] as const,
  today: ['reports', 'today'] as const,
};

export function useProfile() {
  const api = useApi();
  return useQuery({ queryKey: keys.profile, queryFn: () => api.me.get() });
}

export function useProgress() {
  const api = useApi();
  return useQuery({ queryKey: keys.progress, queryFn: () => api.me.progress() });
}

export function useCalendar(weeks: number) {
  const api = useApi();
  return useQuery({ queryKey: keys.calendar(weeks), queryFn: () => api.me.calendar(weeks) });
}

export function useRecommendations() {
  const api = useApi();
  return useQuery({ queryKey: keys.recommendations, queryFn: () => api.me.recommendations() });
}

export function useSpotCheck() {
  const api = useApi();
  return useQuery({ queryKey: keys.spotCheck, queryFn: () => api.me.spotCheck() });
}

export function useWords(q: WordsQuery) {
  const api = useApi();
  return useQuery({ queryKey: keys.words(q), queryFn: () => api.words.list(q) });
}

export function useWord(id: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.word(id), queryFn: () => api.words.one(id) });
}

export function useSummary() {
  const api = useApi();
  return useQuery({ queryKey: keys.summary, queryFn: () => api.words.summary() });
}

export function useReports(limit = 50) {
  const api = useApi();
  return useQuery({ queryKey: keys.reports, queryFn: () => api.reports.list(limit) });
}

export function useToday() {
  const api = useApi();
  return useQuery({ queryKey: keys.today, queryFn: () => api.reports.today() });
}

/** Invalidate everything that a word change touches. */
export function useInvalidateWords() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['words'] });
    void qc.invalidateQueries({ queryKey: keys.progress });
    void qc.invalidateQueries({ queryKey: keys.recommendations });
  };
}

export function useInvalidateReports() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['reports'] });
    void qc.invalidateQueries({ queryKey: keys.progress });
    void qc.invalidateQueries({ queryKey: ['me', 'calendar'] });
    void qc.invalidateQueries({ queryKey: ['words'] });
  };
}

export function usePatchWord(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (patch: { translation?: string; status?: WordStatus }) =>
      api.words.patch(id, patch),
    onSuccess: (w) => {
      qc.setQueryData(keys.word(id), w);
      invalidate();
    },
  });
}

export function useWordPriority(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (priority: WordPriority) => api.words.priority(id, priority),
    onSuccess: (w) => {
      qc.setQueryData(keys.word(id), w);
      invalidate();
    },
  });
}

export function useSubmitReport() {
  const api = useApi();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (v: { type: ReportType; text: string }) => api.reports.submit(v.type, v.text),
    onSuccess: (r) => {
      if (r.status === 'SAVED') invalidate();
    },
  });
}

/**
 * Inner screens: show Telegram's native BackButton and route it to `to`.
 * Outside Telegram the in-app header draws its own back arrow.
 */
export function useBackButton(to: string | (() => void) | null) {
  const navigate = useNavigate();
  useEffect(() => {
    const bb = backButton();
    if (!bb || !to) return;
    const handler = () => (typeof to === 'string' ? navigate(to) : to());
    bb.onClick(handler);
    bb.show();
    return () => {
      bb.offClick(handler);
      bb.hide();
    };
  }, [to, navigate]);
}

/** Save text as a file — the Mini App gets the export as JSON, the client stores it. */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
