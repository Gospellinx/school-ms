import * as React from 'react';
import { AlertCircle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn('flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700', className)} role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </div>
  );
}

export function SuccessNote({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn('flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700', className)} role="status">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </div>
  );
}

export function Empty({ title, children, icon: Icon = Inbox, className }: { title: string; children?: React.ReactNode; icon?: React.ElementType; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-2xl bg-canvas/60 px-6 py-10 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-semibold">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** Shows loading, an error, or the content once data has arrived. */
export function Async<T>({ data, error, children, loadingLabel }: { data: T | null; error: string | null; children: (data: T) => React.ReactNode; loadingLabel?: string }) {
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (data === null) return <Loading label={loadingLabel} />;
  return <>{children(data)}</>;
}
