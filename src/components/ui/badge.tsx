interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'travel' | 'project' | 'success' | 'warning' | 'danger';
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  travel: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  project: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
