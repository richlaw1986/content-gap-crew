'use client';

import Link from 'next/link';

export function Header() {
  return (
    <header className="h-16 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-gray-900">Content Gap Crew</span>
        </Link>
      </div>
      
      <nav className="flex items-center gap-6">
        <Link 
          href="/dashboard" 
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Dashboard
        </Link>
        <Link 
          href="/dashboard/runs" 
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Run History
        </Link>
      </nav>

      <div className="flex items-center gap-4">
        {/* User menu placeholder - will be replaced with auth */}
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-600">U</span>
        </div>
      </div>
    </header>
  );
}
