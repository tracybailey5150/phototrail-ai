'use client';

import type { CollectionMode } from '@/types/database';

interface ModeSelectorProps {
  selected: CollectionMode | null;
  onSelect: (mode: CollectionMode) => void;
}

export function ModeSelector({ selected, onSelect }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => onSelect('travel')}
        className={`p-6 rounded-xl border-2 text-left transition-all ${
          selected === 'travel'
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
        }`}
      >
        <span className="text-3xl">📸</span>
        <h3 className="mt-3 text-lg font-semibold text-zinc-100">Travel & Life</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Organize vacations, events, locations, memories, and daily activities.
        </p>
      </button>

      <button
        type="button"
        onClick={() => onSelect('project')}
        className={`p-6 rounded-xl border-2 text-left transition-all ${
          selected === 'project'
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
        }`}
      >
        <span className="text-3xl">🔧</span>
        <h3 className="mt-3 text-lg font-semibold text-zinc-100">Project & Job Site</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Organize installation photos, rooms, equipment, progress, issues, and field evidence.
        </p>
      </button>
    </div>
  );
}
