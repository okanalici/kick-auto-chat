import React, { useEffect, useRef, useState } from 'react';
import PreviewPanel from './components/PreviewPanel';
import CodePanel from './components/CodePanel';
import JSZip from 'jszip';
import { Download, Check } from 'lucide-react';
import { extensionFiles } from './data/extensionFiles';

import { getAssetUrl, getManifestIconPaths, validateExportFiles } from './lib/exportExtension';
const ZIP_FILE_NAME = 'kick-auto-chat-extension.zip';
const EXPORT_ERROR_MESSAGE = 'Export failed. Please verify required files and icons under public/icons.';

const fetchAssetBlob = async (assetPath: string): Promise<Blob> => {
  const response = await fetch(getAssetUrl(assetPath, import.meta.env.BASE_URL));

  if (!response.ok) {
    throw new Error(`Asset not found: ${assetPath}`);
  }

  const blob = await response.blob();
  if (blob.size === 0 || !blob.type.startsWith('image/')) throw new Error(`Invalid icon asset: ${assetPath}`);
  return blob;
};

const triggerZipDownload = (blob: Blob): void => {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = objectUrl;
  downloadLink.download = ZIP_FILE_NAME;
  try {
    document.body.appendChild(downloadLink);
    downloadLink.click();
  } finally {
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
};

const App: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exportInProgress = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (successTimer.current !== undefined) clearTimeout(successTimer.current);
    };
  }, []);

  const handleExportZip = async () => {
    if (exportInProgress.current) return;
    exportInProgress.current = true;
    if (successTimer.current !== undefined) clearTimeout(successTimer.current);
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const filesToExport = validateExportFiles(extensionFiles);
      const zip = new JSZip();

      // Append core code files
      filesToExport.forEach((file) => {
        zip.file(file.name, file.content);
      });

      // Append icon assets
      const manifestFile = filesToExport.find((file) => file.name === 'manifest.json');
      if (!manifestFile) throw new Error('Required manifest missing');
      const iconPaths = getManifestIconPaths(manifestFile.content);

      await Promise.all(
        iconPaths.map(async (iconPath) => {
          const iconBlob = await fetchAssetBlob(iconPath);
          zip.file(iconPath, iconBlob);
        })
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      if (!mounted.current) return;
      triggerZipDownload(blob);
      setExportSuccess(true);
      successTimer.current = setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error("[ZIP Export] Error generating extension ZIP:", err);
      if (mounted.current) window.alert(EXPORT_ERROR_MESSAGE);
    } finally {
      exportInProgress.current = false;
      if (mounted.current) setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0e11] text-white font-sans">
      {/* Top Navbar */}
      <header className="h-14 border-b border-gray-800/80 flex items-center justify-between px-6 bg-[#080a0c] z-20 shrink-0">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#53fc18] rounded-md flex items-center justify-center shadow-[0_0_15px_rgba(83,252,24,0.35)] transition-transform hover:scale-105">
                <span className="text-black font-black text-lg select-none">K</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-white">
                  Kick <span className="text-[#53fc18]">Auto Chat</span>
              </h1>
              <span className="text-gray-500 font-mono text-xs hidden md:inline-block">/ Developer Dashboard</span>
              <span className="bg-[#53fc18]/10 text-[#53fc18] text-[10px] font-mono px-2 py-0.5 rounded border border-[#53fc18]/20 hidden sm:inline-block">
                v1.0.0
              </span>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExporting}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-all border
                ${exportSuccess 
                  ? 'bg-[#53fc18]/20 border-[#53fc18] text-[#53fc18]' 
                  : 'bg-white/10 hover:bg-white/15 text-white border-white/10 hover:border-white/20 active:scale-95'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {exportSuccess ? (
                <>
                  <Check size={14} className="text-[#53fc18]" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download size={14} className={isExporting ? "animate-bounce" : ""} />
                  <span>{isExporting ? 'Packaging...' : 'Export ZIP'}</span>
                </>
              )}
            </button>
        </div>
      </header>

      {/* Main Split-View Layout */}
      <main className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        {/* Left: Extension Interactive Simulation */}
        <section className="w-full shrink-0 md:w-5/12 lg:w-[380px] border-r border-gray-800/80 relative z-10 shadow-2xl flex flex-col">
            <PreviewPanel />
        </section>

        {/* Right: Extension Source Explorer */}
        <section className="h-[32rem] shrink-0 md:h-auto md:min-w-0 md:flex-1 bg-[#0b0e11] relative overflow-hidden flex flex-col">
            <CodePanel />
        </section>
      </main>
    </div>
  );
};

export default App;
