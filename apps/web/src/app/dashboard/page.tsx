import { ChatArea } from '@/components/dashboard';
import { AgentActivityFeed } from '@/components/dashboard';

export default function DashboardPage() {
  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <ChatArea />
      </div>
      
      {/* Agent activity panel - collapsible on mobile */}
      <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-200 p-4 bg-gray-50">
        <AgentActivityFeed isLive={false} />
        
        {/* Quick stats placeholder */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">0</div>
            <div className="text-xs text-gray-500">Gaps Found</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">0</div>
            <div className="text-xs text-gray-500">Pages Analyzed</div>
          </div>
        </div>
        
        {/* Run info placeholder */}
        <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Current Run</h4>
          <p className="text-sm text-gray-500">
            No active run. Start a new analysis to see details here.
          </p>
        </div>
      </div>
    </div>
  );
}
