'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';

interface Crew {
  _id: string;
  name: string;
  slug: string;
  description: string;
  agentCount: number;
  taskCount: number;
}

interface CrewDetails {
  _id: string;
  name: string;
  description: string;
  process: string;
  agents: Array<{
    _id: string;
    name: string;
    role: string;
    toolCount: number;
  }>;
  tasks: Array<{
    _id: string;
    description: string;
    expectedOutput: string;
    order: number;
    agent: { name: string };
  }>;
}

interface CrewPickerProps {
  onStartRun: (crewId: string, topic: string) => void;
  isRunning?: boolean;
  onCancel?: () => void;
}

export function CrewPicker({ onStartRun, isRunning = false, onCancel }: CrewPickerProps) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
  const [crewDetails, setCrewDetails] = useState<CrewDetails | null>(null);
  const [topic, setTopic] = useState('');
  const [loadingCrews, setLoadingCrews] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available crews on mount
  useEffect(() => {
    async function fetchCrews() {
      try {
        setLoadingCrews(true);
        const data = await api.crews.list();
        setCrews(data as unknown as Crew[]);
        
        // Auto-select if only one crew
        if (data.length === 1) {
          setSelectedCrew(data[0] as unknown as Crew);
        }
      } catch (err) {
        setError('Failed to load crews');
        console.error('Error fetching crews:', err);
      } finally {
        setLoadingCrews(false);
      }
    }
    fetchCrews();
  }, []);

  // Fetch crew details when selected
  useEffect(() => {
    if (!selectedCrew) {
      setCrewDetails(null);
      return;
    }

    async function fetchDetails() {
      try {
        setLoadingDetails(true);
        const data = await api.crews.get(selectedCrew._id);
        setCrewDetails(data as unknown as CrewDetails);
      } catch (err) {
        console.error('Error fetching crew details:', err);
        // Don't show error - details are optional
      } finally {
        setLoadingDetails(false);
      }
    }
    fetchDetails();
  }, [selectedCrew]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCrew || !topic.trim()) return;
    onStartRun(selectedCrew._id, topic.trim());
  };

  if (loadingCrews) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading crews...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Start New Analysis</h2>
      <p className="text-gray-600 mb-6">
        Select a crew and enter a topic to analyze for content gaps.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Crew Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Crew
          </label>
          <div className="grid gap-3">
            {crews.map((crew) => (
              <button
                key={crew._id}
                type="button"
                onClick={() => setSelectedCrew(crew)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  selectedCrew?._id === crew._id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{crew.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{crew.description}</p>
                  </div>
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {crew.agentCount} agents
                    </span>
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {crew.taskCount} tasks
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Crew Details Preview */}
        {selectedCrew && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Crew Preview</h4>
            
            {loadingDetails ? (
              <p className="text-sm text-gray-500">Loading details...</p>
            ) : crewDetails ? (
              <div className="space-y-4">
                {/* Agents */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Agents</h5>
                  <div className="flex flex-wrap gap-2">
                    {crewDetails.agents?.map((agent) => (
                      <span
                        key={agent._id}
                        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm"
                        title={agent.role}
                      >
                        {agent.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tasks */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Workflow</h5>
                  <ol className="space-y-2">
                    {crewDetails.tasks?.sort((a, b) => a.order - b.order).map((task, index) => (
                      <li key={task._id} className="flex items-start gap-2 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="text-gray-600">{task.description}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {selectedCrew.agentCount} agents will analyze your topic through {selectedCrew.taskCount} tasks.
              </p>
            )}
          </div>
        )}

        {/* Topic Input */}
        <div>
          <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-2">
            Analysis Topic
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., headless CMS for enterprise, sustainable fashion trends"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isRunning}
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter the topic or niche you want to analyze for content gaps
          </p>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
            disabled={!selectedCrew || !topic.trim() || isRunning}
          >
            {isRunning ? 'Starting Analysis...' : 'Start Analysis'}
          </Button>

          {onCancel && (
            <Button
              type="button"
              variant="outline"
              className="w-full mt-2"
              onClick={onCancel}
              disabled={isRunning}
            >
              Cancel
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
