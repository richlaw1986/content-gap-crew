import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {Components} from 'react-markdown'

interface MarkdownContentProps {
  content: string
}

const components: Components = {
  h1: ({children}) => (
    <h1 style={{fontSize: '1.125rem', fontWeight: 700, marginTop: 12, marginBottom: 4}}>
      {children}
    </h1>
  ),
  h2: ({children}) => (
    <h2 style={{fontSize: '1rem', fontWeight: 700, marginTop: 12, marginBottom: 4}}>
      {children}
    </h2>
  ),
  h3: ({children}) => (
    <h3 style={{fontSize: '0.875rem', fontWeight: 700, marginTop: 8, marginBottom: 4}}>
      {children}
    </h3>
  ),
  h4: ({children}) => (
    <h4 style={{fontSize: '0.875rem', fontWeight: 600, marginTop: 8, marginBottom: 4}}>
      {children}
    </h4>
  ),
  p: ({children}) => (
    <p style={{marginBottom: 8, lineHeight: 1.6}}>{children}</p>
  ),
  ul: ({children}) => (
    <ul style={{listStyleType: 'disc', paddingLeft: 20, marginBottom: 8}}>{children}</ul>
  ),
  ol: ({children}) => (
    <ol style={{listStyleType: 'decimal', paddingLeft: 20, marginBottom: 8}}>{children}</ol>
  ),
  li: ({children}) => <li style={{lineHeight: 1.6}}>{children}</li>,
  code: ({className, children, ...props}) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code
          style={{
            display: 'block',
            background: '#18181b',
            color: '#e4e4e7',
            borderRadius: 6,
            padding: 12,
            margin: '8px 0',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        style={{
          background: 'var(--card-bg-color, #f4f4f5)',
          color: '#e11d48',
          padding: '1px 4px',
          borderRadius: 3,
          fontSize: '0.75rem',
          fontFamily: 'monospace',
        }}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({children}) => <pre style={{margin: '8px 0'}}>{children}</pre>,
  a: ({children, href}) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{color: '#2563eb', textDecoration: 'underline'}}
    >
      {children}
    </a>
  ),
  blockquote: ({children}) => (
    <blockquote
      style={{
        borderLeft: '3px solid var(--card-border-color, #d4d4d8)',
        paddingLeft: 12,
        fontStyle: 'italic',
        margin: '8px 0',
        opacity: 0.8,
      }}
    >
      {children}
    </blockquote>
  ),
  table: ({children}) => (
    <div style={{overflowX: 'auto', margin: '8px 0'}}>
      <table
        style={{
          minWidth: '100%',
          fontSize: '0.75rem',
          borderCollapse: 'collapse',
          border: '1px solid var(--card-border-color, #e4e4e7)',
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({children}) => (
    <thead style={{background: 'var(--card-bg-color, #f4f4f5)'}}>{children}</thead>
  ),
  th: ({children}) => (
    <th
      style={{
        border: '1px solid var(--card-border-color, #e4e4e7)',
        padding: '4px 8px',
        textAlign: 'left',
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  ),
  td: ({children}) => (
    <td
      style={{
        border: '1px solid var(--card-border-color, #e4e4e7)',
        padding: '4px 8px',
      }}
    >
      {children}
    </td>
  ),
  hr: () => (
    <hr
      style={{
        margin: '12px 0',
        border: 'none',
        borderTop: '1px solid var(--card-border-color, #e4e4e7)',
      }}
    />
  ),
  strong: ({children}) => <strong style={{fontWeight: 600}}>{children}</strong>,
}

export function MarkdownContent({content}: MarkdownContentProps) {
  return (
    <div style={{fontSize: '0.875rem', maxWidth: '100%'}}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
