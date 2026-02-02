'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';

export function Header() {
  const { data: session, status } = useSession();
  const [showMenu, setShowMenu] = useState(false);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  return (
    <header className="h-16 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-gray-900">CrewAI Platform</span>
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
        {status === 'loading' ? (
          <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
        ) : session?.user ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-sm text-gray-700 hidden sm:block">
                {session.user.name || session.user.email}
              </span>
            </button>

            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.user.name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
