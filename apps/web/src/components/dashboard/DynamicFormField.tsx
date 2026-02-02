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
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed';

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
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={disabled}
            />
            <span className="text-gray-700">{field.placeholder || 'Enable'}</span>
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
            {arrayValue.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {arrayValue.map((item, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-sm"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => handleArrayRemove(index)}
                      disabled={disabled}
                      className="ml-1 text-gray-500 hover:text-red-500 disabled:cursor-not-allowed"
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
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {renderField()}
      {field.helpText && (
        <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
      )}
    </div>
  );
}
