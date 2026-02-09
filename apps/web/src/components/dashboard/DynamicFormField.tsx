'use client';

import { useState } from 'react';

export interface InputField {
  name: string;
  label: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'array' | 'select';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | number | boolean | string[];
  options?: string[];
}

interface DynamicFormFieldProps {
  field: InputField;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
}

export function DynamicFormField({ field, value, onChange, disabled = false }: DynamicFormFieldProps) {
  const [arrayInput, setArrayInput] = useState('');

  const baseInputClasses = 
    'w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:bg-surface-muted disabled:cursor-not-allowed';

  const handleArrayAdd = () => {
    if (!arrayInput.trim()) return;
    const currentArray = (value as string[]) || [];
    onChange(field.name, [...currentArray, arrayInput.trim()]);
    setArrayInput('');
  };

  const handleArrayRemove = (index: number) => {
    const currentArray = (value as string[]) || [];
    onChange(field.name, currentArray.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleArrayAdd();
    }
  };

  const renderField = () => {
    switch (field.type) {
      case 'string':
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            className={baseInputClasses}
            disabled={disabled}
            required={field.required}
          />
        );

      case 'text':
        return (
          <textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            className={`${baseInputClasses} min-h-[100px] resize-y`}
            disabled={disabled}
            required={field.required}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(field.name, e.target.value ? Number(e.target.value) : undefined)}
            placeholder={field.placeholder}
            className={baseInputClasses}
            disabled={disabled}
            required={field.required}
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(value as boolean) || false}
              onChange={(e) => onChange(field.name, e.target.checked)}
              className="w-5 h-5 rounded border-border text-accent focus:ring-ring"
              disabled={disabled}
            />
            <span className="text-muted-foreground">{field.placeholder || 'Enable'}</span>
          </label>
        );

      case 'select':
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={baseInputClasses}
            disabled={disabled}
            required={field.required}
          >
            <option value="">{field.placeholder || 'Select an option...'}</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'array':
        const arrayValue = (value as string[]) || [];
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={arrayInput}
                onChange={(e) => setArrayInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={field.placeholder || 'Add item...'}
                className={baseInputClasses}
                disabled={disabled}
              />
              <button
                type="button"
                onClick={handleArrayAdd}
                disabled={disabled || !arrayInput.trim()}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 disabled:bg-surface-muted disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
            {arrayValue.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {arrayValue.map((item, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-surface-muted border border-border rounded-full text-sm text-foreground"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => handleArrayRemove(index)}
                      disabled={disabled}
                      className="ml-1 text-muted-foreground hover:text-red-500 disabled:cursor-not-allowed"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            className={baseInputClasses}
            disabled={disabled}
          />
        );
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {renderField()}
      {field.helpText && (
        <p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
