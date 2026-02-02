import Link from 'next/link';
import { Button } from '@/components/ui';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            CrewAI Platform
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Run AI agent crews for any task
          </p>
          
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              🚧 Under Construction
            </h2>
            <p className="text-gray-600 mb-6">
              We&apos;re building something great. The full application will include:
            </p>
            <ul className="text-left text-gray-600 space-y-2 mb-6">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Competitor content analysis
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                AI-powered gap identification
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                SEO & AEO optimization recommendations
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Real-time analysis dashboard
              </li>
            </ul>
            
            <Link href="/dashboard">
              <Button variant="primary" size="lg">
                Preview Dashboard
              </Button>
            </Link>
          </div>
          
          <p className="text-sm text-gray-500">
            Built with Next.js, FastAPI, and Sanity CMS
          </p>
        </div>
      </div>
    </main>
  );
}
