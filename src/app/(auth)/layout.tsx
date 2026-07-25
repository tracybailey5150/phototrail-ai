import { APP_NAME } from '@/lib/constants';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pt-bg px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">📸</span>
          <h1 className="mt-3 text-xl font-bold text-amber-400">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-zinc-500">Intelligent photo organization & evidence platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
