import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, FileCode, Terminal } from 'lucide-react';
import { extensionFiles } from '../data/extensionFiles';

const CodePanel: React.FC = () => {
  const [activeFile, setActiveFile] = useState(extensionFiles[0]);
  const [copied, setCopied] = useState(false);

  const [copyError, setCopyError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyRequest = useRef(0);

  useEffect(() => {
    copyRequest.current += 1;
    setCopied(false);
    setCopyError(false);
    return () => {
      copyRequest.current += 1;
      if (copyTimer.current !== undefined) clearTimeout(copyTimer.current);
    };
  }, [activeFile]);

  const handleCopy = async () => {
    const request = ++copyRequest.current;
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current);
    setCopied(false);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(activeFile.content);
      if (request !== copyRequest.current) return;
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (request === copyRequest.current) setCopyError(true);
    }
  };

  const lines = useMemo(() => activeFile.content.split('\n'), [activeFile.content]);
  const highlightedLines = useMemo(() => lines.map(line => highlightSyntax(line, activeFile.language)), [lines, activeFile.language]);
  const lineCount = lines.length;
  const fileSizeKb = useMemo(() => (new Blob([activeFile.content]).size / 1024).toFixed(1), [activeFile.content]);

  return (
    <div className="flex flex-col h-full bg-[#0b0e11] border-l border-gray-800">
      {/* Panel Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-gray-800 bg-[#0b0e11]">
        <div className="flex items-center gap-2 text-gray-400">
          <Terminal size={18} className="text-[#53fc18]" />
          <span className="font-mono text-sm font-medium text-white">Source Explorer</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-gray-500">{lineCount} lines</span>
          <span className="text-[11px] font-mono text-gray-500">•</span>
          <span className="text-[11px] font-mono text-gray-500">{fileSizeKb} KB</span>
          <span className="text-[10px] font-mono text-[#53fc18] bg-[#53fc18]/10 border border-[#53fc18]/20 px-2 py-0.5 rounded uppercase">Manifest V3</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto bg-[#080a0c] border-b border-gray-800/80">
        {extensionFiles.map((file) => (
          <button
            key={file.name}
            onClick={() => setActiveFile(file)}
            className={`
              flex items-center gap-2 px-4 py-3 text-xs font-mono border-b-2 transition-colors whitespace-nowrap
              ${activeFile.name === file.name 
                ? 'border-[#53fc18] text-white bg-white/5 font-semibold' 
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'}
            `}
          >
            <FileCode size={14} className={activeFile.name === file.name ? 'text-[#53fc18]' : 'text-gray-500'} />
            {file.name}
          </button>
        ))}
      </div>

      {/* Code Area */}
      <div className="flex-1 relative overflow-hidden bg-[#0d1014]">
        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-[#181b20] hover:bg-[#242830] text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-medium transition-all border border-gray-700 shadow-md"
        >
          {copied ? <Check size={14} className="text-[#53fc18]" /> : <Copy size={14} />}
          {copied ? 'Copied!' : copyError ? 'Copy failed — retry' : 'Copy Code'}
        </button>

        {/* Code Block */}
        <div className="h-full overflow-y-auto overflow-x-hidden p-6 font-mono text-xs leading-relaxed">
           <pre className="text-gray-300 font-mono">
            <code>
                {highlightedLines.map((line, i) => (
                    <div key={i} className="flex hover:bg-white/[0.02] py-0.5 rounded px-1">
                        <span className="shrink-0 w-9 text-gray-600 select-none text-right pr-4 font-mono">{i + 1}</span>
                        <span className="break-all whitespace-pre-wrap flex-1">{line}</span>
                    </div>
                ))}
            </code>
           </pre>
        </div>
      </div>
    </div>
  );
};

// Syntax highlighter helper
const highlightSyntax = (line: string, lang: string) => {
    // JSON Highlighting
    if (lang === 'json') {
        const parts = line.split(/(".*?")/g);
        return parts.map((part, i) => {
             if (part.startsWith('"')) {
                 const isKey = line.trim().indexOf(part) === 0 || (parts[i-1] && parts[i-1].trim().endsWith(':') === false);
                 return <span key={i} className={isKey ? "text-[#79c0ff]" : "text-[#a5d6ff]"}>{part}</span>;
             }
             if (/^-?\d+(\.\d+)?$/.test(part.trim())) {
                 return <span key={i} className="text-[#79c0ff]">{part}</span>;
             }
             if (part.trim() === 'true' || part.trim() === 'false' || part.trim() === 'null') {
                 return <span key={i} className="text-[#ff7b72]">{part}</span>;
             }
             return <span key={i} className="text-gray-300">{part}</span>;
        });
    }

    // Comment Highlighting
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
        return <span className="text-[#8b949e] italic">{line}</span>;
    }
    
    // JS/CSS/HTML Highlighting
    const keywords = ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'if', 'else', 'true', 'false', 'null', 'undefined', 'async', 'await', 'try', 'catch', 'finally'];
    const parts = line.split(/(\b(?:const|let|var|function|return|import|export|if|else|true|false|null|undefined|async|await|try|catch|finally)\b|"[^"]*"|'[^']*'|`[^`]*`)/g);
    
    return parts.map((part, i) => {
        if (keywords.includes(part)) return <span key={i} className="text-[#ff7b72] font-semibold">{part}</span>;
        if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")) || (part.startsWith("`") && part.endsWith("`"))) {
            return <span key={i} className="text-[#a5d6ff]">{part}</span>;
        }
        if (part.includes('chrome.') || part.includes('document.') || part.includes('window.')) {
            return <span key={i} className="text-[#d2a8ff]">{part}</span>;
        }
        return <span key={i} className="text-gray-300">{part}</span>;
    });
};

export default CodePanel;