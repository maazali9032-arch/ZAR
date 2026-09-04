import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile } = useAuth();

  const roleLabel = profile?.role === 'admin' ? 'Administrator' : 'Shop Owner';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm font-semibold text-gray-900">{roleLabel}</p>
          <p className="hidden text-xs text-gray-500 sm:block">ZAR Admin Dashboard</p>
        </div>
      </div>
    </header>
  );
}
