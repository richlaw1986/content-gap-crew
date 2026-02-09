'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { DynamicFormField, InputField } from './DynamicFormField';

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
  inputSchema?: InputField[];
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
  onStartRun: (crewId: string, inputs: Record<string, unknown>) => void;
  isRunning?: boolean;
  onCancel?: () => void;
}

export function CrewPicker({ onStartRun, isRunning = false, onCancel }: CrewPickerProps) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
  const [crewDetails, setCrewDetails] = useState<CrewDetails | null>(null);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [loadingCrews, setLoadingCrews] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch crews on mount
  useEffect(() => {
    async function fetchCrews() {
      try {
        setLoadingCrews(true);
        const data = await api.crews.list();
        setCrews(data as unknown as Crew[]);
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

  // Fetch crew details when selection changes
  useEffect(() => {
    if (!selectedCrew) {
      setCrewDetails(null);
      setInputs({});
      return;
    }

    async function fetchDetails() {
      if (!selectedCrew) return;
      try {
        setLoadingDetails(true);
        const data = await api.crews.get(selectedCrew._id);
        const details = data as unknown as CrewDetails;
        setCrewDetails(details);
        
        // Initialize inputs with default values from schema
        const initialInputs: Record<string, unknown> = {};
        if (details.inputSchema) {
          for (const field of details.inputSchema) {
            if (field.defaultValue !== undefined && field.defaultValue !== null) {
              initialInputs[field.name] = field.defaultValue;
            } else if (field.type === 'array') {
              initialInputs[field.name] = [];
            } else if (field.type === 'boolean') {
              initialInputs[field.name] = false;
            }
          }
        }
        setInputs(initialInputs);
      } catch (err) {
        console.error('Error fetching crew details:', err);
      } finally {
        setLoadingDetails(false);
      }
    }
    fetchDetails();
  }, [selectedCrew]);

  const handleInputChange = (name: string, value: unknown) => {
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const isFormValid = (): boolean => {
    if (!selectedCrew || !crewDetails?.inputSchema) return false;
    
    for (const field of crewDetails.inputSchema) {
      if (field.required) {
        const value = inputs[field.name];
        if (value === undefined || value === null || value === '') {
          return false;
        }
        if (field.type === 'array' && Array.isArray(value) && value.length === 0) {
          // Arrays are valid even if empty for required fields (user might not need to add items)
          // But if it's truly required, we check for at least one item
          // For now, let's be lenient - empty array is OK
        }
      }
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCrew || !isFormValid()) return;
    onStartRun(selectedCrew._id, inputs);
  };

  if (loadingCrews) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading crews...</div>
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

  // Get input schema or fall back to default topic field
  const inputSchema: InputField[] = crewDetails?.inputSchema || [
    {
      name: 'topic',
      label: 'Topic',
      type: 'string',
      required: true,
      placeholder: 'Enter a topic...',
      helpText: 'The main topic for this run',
    }
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-semibold text-foreground mb-2">Start New Workflow</h2>
      <p className="text-muted-foreground mb-6">
        Select a crew and configure inputs to launch a workflow.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Crew Selection */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
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
                    ? 'border-accent bg-surface-muted'
                    : 'border-border hover:border-accent/60 bg-surface'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{crew.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{crew.description}</p>
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-1 bg-surface-muted rounded">
                      {crew.agentCount} agents
                    </span>
                    <span className="px-2 py-1 bg-surface-muted rounded">
                      {crew.taskCount} tasks
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Crew Preview */}
        {selectedCrew && (
          <div className="bg-surface-muted rounded-lg p-4 border border-border">
            <h4 className="font-medium text-foreground mb-3">Crew Preview</h4>
            
            {loadingDetails ? (
              <p className="text-sm text-muted-foreground">Loading details...</p>
            ) : crewDetails ? (
              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-medium text-muted-foreground mb-2">Agents</h5>
                  <div className="flex flex-wrap gap-2">
                    {crewDetails.agents?.map((agent) => (
                      <span
                        key={agent._id}
                        className="px-3 py-1 bg-surface border border-border rounded-full text-sm text-foreground"
                        title={agent.role}
                      >
                        {agent.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-medium text-muted-foreground mb-2">Workflow</h5>
                  <ol className="space-y-2">
                    {crewDetails.tasks?.sort((a, b) => a.order - b.order).map((task, index) => (
                      <li key={task._id} className="flex items-start gap-2 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 bg-surface text-muted-foreground border border-border rounded-full flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="text-muted-foreground">{task.description}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedCrew.agentCount} agents will process your inputs through {selectedCrew.taskCount} tasks.
              </p>
            )}
          </div>
        )}

        {/* Dynamic Input Fields */}
        {selectedCrew && (
          <div className="space-y-4">
            <h4 className="font-medium text-foreground">Inputs</h4>
            {inputSchema.map((field) => (
              <DynamicFormField
                key={field.name}
                field={field}
                value={inputs[field.name]}
                onChange={handleInputChange}
                disabled={isRunning}
              />
            ))}
          </div>
        )}

        {/* Submit Buttons */}
        <div className="space-y-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!selectedCrew || !isFormValid() || isRunning}
          >
            {isRunning ? 'Starting Workflow...' : 'Start Workflow'}
          </Button>

          {onCancel && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onCancel}
              disabled={isRunning}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
