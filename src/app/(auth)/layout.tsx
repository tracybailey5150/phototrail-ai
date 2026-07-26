import { APP_NAME } from '@/lib/constants';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pt-bg px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt={APP_NAME} className="h-20 mx-auto" />
          <p className="mt-2 text-xs text-zinc-500">Every Photo. Every Place. Every Memory.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
