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
    <header className="h-16 border-b border-border bg-surface px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-semibold text-foreground">Agent Studio</span>
        </Link>
      </div>
      
      {/* Navigation links removed — chat history sidebar replaces them */}
      <div />

      <div className="flex items-center gap-4">
        {status === 'loading' ? (
          <div className="w-8 h-8 rounded-full bg-surface-muted animate-pulse" />
        ) : session?.user ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <span className="text-sm font-medium text-accent-foreground">
                  {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-sm text-muted-foreground hidden sm:block">
                {session.user.name || session.user.email}
              </span>
            </button>

            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-surface rounded-lg shadow-lg border border-border py-1 z-20">
                  <div className="px-4 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">
                      {session.user.name || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface-muted transition-colors"
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
            className="text-sm font-medium text-accent hover:opacity-80 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
