import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthConfig, Provider } from 'next-auth';

// Simple in-memory user store for MVP
// TODO: Replace with Sanity or database storage
const users: Map<string, { id: string; email: string; name: string; password: string }> = new Map();

// Build providers list — only add Google when credentials are present
const providers: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

providers.push(
  Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' }, // 'login' or 'register'
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const action = credentials.action as string;

        if (action === 'register') {
          // Check if user already exists
          if (users.has(email)) {
            throw new Error('User already exists');
          }

          // Create new user
          const user = {
            id: `user-${Date.now()}`,
            email,
            name: email.split('@')[0],
            password, // In production, hash this!
          };
          users.set(email, user);

          return { id: user.id, email: user.email, name: user.name };
        }

        // Login flow
        const user = users.get(email);
        if (!user || user.password !== password) {
          throw new Error('Invalid email or password');
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
);

export const authConfig: NextAuthConfig = {
  // AUTH_SECRET env var is read automatically; fall back to a static dev secret
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production',

  providers,
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
  
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isOnAuth = nextUrl.pathname === '/login' || nextUrl.pathname === '/register';

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }

      if (isOnAuth && isLoggedIn) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
    
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  
  session: {
    strategy: 'jwt',
  },
  
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Helper function for registration API
export async function registerUser(email: string, password: string, name?: string) {
  if (users.has(email)) {
    throw new Error('User already exists');
  }

  const user = {
    id: `user-${Date.now()}`,
    email,
    name: name || email.split('@')[0],
    password, // In production, hash this!
  };
  users.set(email, user);

  return { id: user.id, email: user.email, name: user.name };
}
