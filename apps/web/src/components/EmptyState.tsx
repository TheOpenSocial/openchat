interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ description, title }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 px-5 py-8 text-center">
      <h3 className="mb-2 text-base font-semibold text-slate-100">{title}</h3>
      <p className="text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}
