import Link from 'next/link';
import { Button } from '@/components/ui';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI workflows • crews • skills
          </div>
          <h1 className="mt-6 text-4xl font-semibold text-foreground md:text-5xl">
            Agent Studio
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Build, orchestrate, and run AI agent crews for any workflow.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard">
              <Button variant="primary" size="lg">
                Open Studio
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                Sign in
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Flexible crews',
              description: 'Pick fixed crews or let the planner assemble agents dynamically.',
            },
            {
              title: 'Reusable skills',
              description: 'Agents search skills and reuse proven procedures for consistency.',
            },
            {
              title: 'Tool-aware runs',
              description: 'Discover available tools and MCP services at runtime.',
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-surface-muted p-6 text-sm text-muted-foreground">
          Powered by Next.js, FastAPI, and Sanity. Configure agents, skills, and planners in Studio.
        </div>
      </div>
    </main>
  );
}
